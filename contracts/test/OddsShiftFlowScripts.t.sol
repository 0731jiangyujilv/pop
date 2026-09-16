// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EventMarketV2} from "../src/EventMarketV2.sol";
import {IEventMarketV2} from "../src/interfaces/IEventMarketV2.sol";
import {OddsShiftFairFlow} from "../script/OddsShiftFairFlow.s.sol";
import {OddsShiftToxicFlow} from "../script/OddsShiftToxicFlow.s.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @dev The scripts read their market and key from the process environment,
///      which every test in this file would otherwise share and race on. The
///      harnesses override the two hooks so each test drives its own market.
contract FairFlow is OddsShiftFairFlow {
    address immutable mkt;
    uint256 immutable key;

    constructor(address mkt_, uint256 key_) {
        mkt = mkt_;
        key = key_;
    }

    function _marketAddress() internal view override returns (address) {
        return mkt;
    }

    function _privateKey() internal view override returns (uint256) {
        return key;
    }
}

contract ToxicFlow is OddsShiftToxicFlow {
    address immutable mkt;
    uint256 immutable key;

    constructor(address mkt_, uint256 key_) {
        mkt = mkt_;
        key = key_;
    }

    function _marketAddress() internal view override returns (address) {
        return mkt;
    }

    function _privateKey() internal view override returns (uint256) {
        return key;
    }
}

/// @notice The two demo flows, run against a local market exactly as they would
///         run against a testnet one.
///
/// @dev These scripts exist to be watched, live, in front of people, so the
///      thing worth testing is the story: {OddsShiftFairFlow} must end with the
///      trader refunded and nothing charged, {OddsShiftToxicFlow} must end with
///      the causes charged and nothing refunded. Both scripts assert that much
///      internally — running them here is what proves the assertions hold at a
///      real pool depth, and that the closed-form sizing actually lands on the
///      probability targets the thresholds are compared against.
contract OddsShiftFlowScriptsTest is Test {
    MockERC20 usdc;
    EventMarketV2 market;

    address owner = makeAddr("owner");
    address platform = makeAddr("platform");

    /// @dev The scripts sign, so the trader has to be a real keypair.
    uint256 constant TRADER_PK = 0xA11CE;
    address trader;

    uint256 constant INIT_LIQUIDITY = 100e6; // 100 USDC
    uint16 constant BASE_FEE_BPS = 30;
    uint16 constant PROTECTION_FEE_BPS = 70;
    uint32 constant JUMP = 50_000; // 5 probability points
    uint32 constant CONTRIB = 10_000; // 1 probability point
    uint32 constant LOOKBACK = 5;
    uint32 constant OBSERVE = 5;
    uint32 constant COOLDOWN = 120;

    function setUp() public {
        vm.warp(10_000);
        trader = vm.addr(TRADER_PK);

        usdc = new MockERC20("USD Coin", "USDC", 6);
        market = new EventMarketV2(_params());
        usdc.mint(address(this), INIT_LIQUIDITY);
        usdc.transfer(address(market), INIT_LIQUIDITY);
        market.initializeMarket(owner, INIT_LIQUIDITY);
    }

    /*//////////////////////////////////////////////////////////////
                               FAIR FLOW
    //////////////////////////////////////////////////////////////*/

    function test_fairFlow_refundsEveryTradeInTheWindow() public {
        _fair().run();

        IEventMarketV2.OddsShiftInfo memory i = market.getOddsShiftInfo();
        assertEq(i.totalShocks, 1, "exactly one shock");
        assertEq(
            _shock(0).outcome, uint8(IEventMarketV2.ShockOutcome.Reverted), "the shock reverted"
        );
        assertEq(i.cumChargedFee, 0, "nothing may be charged in the fair flow");

        // #0..#4 are the window the corrector rescued.
        for (uint256 id = 0; id < LOOKBACK; ++id) {
            _assertOutcome(id, IEventMarketV2.TradeOutcome.RefundedReverted, "window trade");
        }
        // #5 is the corrector: the tail buys retire it without a shock of its own.
        _assertOutcome(LOOKBACK, IEventMarketV2.TradeOutcome.RefundedNoShock, "the corrector");
        // #6..#9 are the tail, still waiting for a window that will never form.
        for (uint256 id = LOOKBACK + 1; id < i.totalTrades; ++id) {
            _assertOutcome(id, IEventMarketV2.TradeOutcome.Pending, "tail trade");
        }

        assertGt(i.cumRebated, 0, "something must have been refunded");
        // The script claims, so the refund is in the wallet, not just credited.
        assertEq(market.rebateClaimable(trader), 0, "the script should have claimed");
        _assertEscrowAccountedFor(i);
    }

    function test_fairFlow_thenFinalizeRefundsTheTail() public {
        FairFlow s = _fair();
        s.run();

        vm.warp(block.timestamp + COOLDOWN + 1);
        s.finalize();

        IEventMarketV2.OddsShiftInfo memory i = market.getOddsShiftInfo();
        assertEq(i.pendingCount, 0, "the queue should be drained");
        assertEq(i.pendingEscrow, 0, "no escrow may be left holding");
        assertEq(i.cumChargedFee, 0, "the fair flow never charges");
        for (uint256 id = 0; id < i.totalTrades; ++id) {
            assertTrue(
                this.outcomeOf(id) != uint8(IEventMarketV2.TradeOutcome.Charged),
                "no trade may be charged"
            );
        }
    }

    /// @dev The headline number: a flow that came back costs the base fee and
    ///      nothing more.
    function test_fairFlow_netCostIsTheBaseFeeOnly() public {
        FairFlow s = _fair();
        s.run();
        vm.warp(block.timestamp + COOLDOWN + 1);
        s.finalize();

        uint256 walletBefore = usdc.balanceOf(trader);
        uint256 owed = market.rebateClaimable(trader);
        vm.prank(trader);
        market.claimRebate();
        assertEq(usdc.balanceOf(trader) - walletBefore, owed, "the tail refund reached the wallet");

        IEventMarketV2.OddsShiftInfo memory i = market.getOddsShiftInfo();
        assertEq(i.cumChargedFee, 0, "nothing charged");
        // Every escrowed cent came back, and it stood in the 70:30 ratio to the
        // base fee that did not — so the trader paid 0.30% of 1.00%.
        assertEq(i.cumRebated + i.pendingEscrow, _escrowedTotal(i), "all escrow refunded");
        assertApproxEqAbs(
            i.cumRebated * BASE_FEE_BPS / PROTECTION_FEE_BPS,
            i.cumBaseFee,
            i.totalTrades, // one wei of flooring per trade, on each slice
            "escrow and base fee should stand in the 70:30 ratio"
        );
    }

    /*//////////////////////////////////////////////////////////////
                               TOXIC FLOW
    //////////////////////////////////////////////////////////////*/

    function test_toxicFlow_chargesTheCausesAndRefundsNothing() public {
        _toxic().run();

        IEventMarketV2.OddsShiftInfo memory i = market.getOddsShiftInfo();
        assertEq(i.totalShocks, 2, "the observation trades open the next shock");
        assertEq(_shock(0).outcome, uint8(IEventMarketV2.ShockOutcome.Toxic), "the shock is toxic");
        assertTrue(i.shockOpen, "the second shock is still observing");

        for (uint256 id = 0; id < LOOKBACK; ++id) {
            _assertOutcome(id, IEventMarketV2.TradeOutcome.Charged, "window trade");
        }
        for (uint256 id = LOOKBACK; id < i.totalTrades; ++id) {
            _assertOutcome(id, IEventMarketV2.TradeOutcome.Pending, "observation trade");
        }

        assertEq(i.cumRebated, 0, "nothing may be refunded in the toxic flow");
        assertEq(market.rebateClaimable(trader), 0, "the trader gets nothing back");
        assertGt(i.cumChargedFee, 0, "the causes must have paid");
        _assertEscrowAccountedFor(i);
    }

    function test_toxicFlow_thenFinalizeChargesTheSecondWindow() public {
        ToxicFlow s = _toxic();
        s.run();

        vm.warp(block.timestamp + COOLDOWN + 1);
        s.finalize();

        IEventMarketV2.OddsShiftInfo memory i = market.getOddsShiftInfo();
        assertEq(i.pendingCount, 0, "the queue should be drained");
        assertEq(i.pendingEscrow, 0, "no escrow may be left holding");
        assertEq(i.cumRebated, 0, "still nothing refunded");
        assertEq(
            _shock(1).outcome,
            uint8(IEventMarketV2.ShockOutcome.Toxic),
            "the second window is toxic too"
        );
        for (uint256 id = 0; id < i.totalTrades; ++id) {
            _assertOutcome(id, IEventMarketV2.TradeOutcome.Charged, "every trade is a cause");
        }
    }

    /// @dev The forfeited escrow lands on LPs, through the same accumulator the
    ///      base fee uses.
    function test_toxicFlow_chargedFeeIsClaimableByLps() public {
        ToxicFlow s = _toxic();
        s.run();
        vm.warp(block.timestamp + COOLDOWN + 1);
        s.finalize();

        IEventMarketV2.OddsShiftInfo memory i = market.getOddsShiftInfo();
        uint256 before = usdc.balanceOf(owner);
        vm.prank(owner);
        market.claimLpReward();

        // The seed LP is the only one, so it collects both streams, bar the
        // per-share integer-division dust.
        assertApproxEqAbs(
            usdc.balanceOf(owner) - before,
            i.cumBaseFee + i.cumChargedFee,
            20,
            "the sole LP should collect base + charged"
        );
    }

    /*//////////////////////////////////////////////////////////////
                              CALIBRATION
    //////////////////////////////////////////////////////////////*/

    /// @dev The pool is deeper and the probability is elsewhere after the first
    ///      demo. The sizes are solved from live reserves precisely so a second
    ///      run still lands on its thresholds.
    function test_flowsAreRepeatableOnTheSameMarket() public {
        FairFlow fair = _fair();
        fair.run();
        vm.warp(block.timestamp + COOLDOWN + 1);
        fair.finalize();

        _toxic().run();

        IEventMarketV2.OddsShiftInfo memory i = market.getOddsShiftInfo();
        assertEq(i.totalShocks, 3, "one reverted shock, then two from the toxic run");
        assertEq(_shock(1).outcome, uint8(IEventMarketV2.ShockOutcome.Toxic), "shock 1 is toxic");
        assertEq(_shock(0).outcome, uint8(IEventMarketV2.ShockOutcome.Reverted), "shock 0 stands");
    }

    /// @dev The demo token in this workspace has 18 decimals, not 6.
    function test_flowsAreDecimalAgnostic() public {
        usdc = new MockERC20("Demo USD", "USDT", 18);
        market = new EventMarketV2(_params());
        usdc.mint(address(this), 100e18);
        usdc.transfer(address(market), 100e18);
        market.initializeMarket(owner, 100e18);

        _fair().run();

        assertEq(
            _shock(0).outcome,
            uint8(IEventMarketV2.ShockOutcome.Reverted),
            "the same story at 18 decimals"
        );
        assertEq(market.getOddsShiftInfo().cumChargedFee, 0, "nothing charged");
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    function _fair() internal returns (FairFlow) {
        return new FairFlow(address(market), TRADER_PK);
    }

    function _toxic() internal returns (ToxicFlow) {
        return new ToxicFlow(address(market), TRADER_PK);
    }

    /// @dev `public` and reached through `this`: decoding getTrades' array and
    ///      encoding an assertion in one frame overflows the IR stack.
    function outcomeOf(uint256 id) public view returns (uint8) {
        return market.getTrades(id, 1)[0].outcome;
    }

    function escrowOf(uint256 id) public view returns (uint256) {
        return market.getTrades(id, 1)[0].escrow;
    }

    function _assertOutcome(uint256 id, IEventMarketV2.TradeOutcome want, string memory why)
        internal
        view
    {
        assertEq(this.outcomeOf(id), uint8(want), why);
    }

    /// @dev No escrowed cent may go missing: it is refunded, charged, or held.
    function _assertEscrowAccountedFor(IEventMarketV2.OddsShiftInfo memory i) internal view {
        assertEq(
            i.cumRebated + i.cumChargedFee + i.pendingEscrow,
            _escrowedTotal(i),
            "escrow must be refunded, charged, or still held"
        );
    }

    function _escrowedTotal(IEventMarketV2.OddsShiftInfo memory i)
        internal
        view
        returns (uint256 total)
    {
        for (uint256 id = 0; id < i.totalTrades; ++id) {
            total += this.escrowOf(id);
        }
    }

    function _shock(uint256 id) internal view returns (IEventMarketV2.Shock memory) {
        return market.getShocks(id, 1)[0];
    }

    function _params() internal view returns (EventMarketV2.Params memory p) {
        p.usdc = address(usdc);
        p.admin = owner;
        p.creator = owner;
        p.platform = platform;
        p.question = "OddsShift demo market";
        p.resolutionSource = "admin";
        p.bettingDeadline = block.timestamp + 1 days;
        p.resolveAfter = block.timestamp + 1 days + 2 hours;
        p.lpSwapFeeBps = 0;
        p.platformFeeBps = 70;
        p.creatorFeeBps = 30;
        p.baseFeeBps = BASE_FEE_BPS;
        p.protectionFeeBps = PROTECTION_FEE_BPS;
        p.jumpThreshold = JUMP;
        p.contribThreshold = CONTRIB;
        p.lookback = LOOKBACK;
        p.observeWindow = OBSERVE;
        p.cooldown = COOLDOWN;
    }
}
