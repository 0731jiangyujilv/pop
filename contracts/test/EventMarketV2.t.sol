// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EventMarketV2} from "../src/EventMarketV2.sol";
import {IEventMarket} from "../src/interfaces/IEventMarket.sol";
import {IEventMarketV2} from "../src/interfaces/IEventMarketV2.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice EventMarketV2 — the V1 AMM plus OddsShift window-based LP protection.
///         V1 behaviour is re-checked as a regression baseline; the OddsShift
///         tests follow the demo script in `oddsshift_todos.md` section 5.
///
/// @dev All the trade sizes below are calibrated to the 100 USDC pool with
///      `lpSwapFeeBps = 0`. The CPMM keeps `k = yesReserve * noReserve`
///      invariant across swaps, so with `N = noReserve` the YES probability is
///      exactly `N^2 / (N^2 + k)` — which is why a trade's impact depends only
///      on the cumulative net inflow, not on how it was split:
///
///        gross 12 USDC  50.00% -> 55.59%   (5.6 points — over the 5-point jump)
///        gross  3 USDC   +1.3 - 1.5 points (over the 1-point contribution bar)
///        gross  1 USDC   +0.4 - 0.5 points (under it)
contract EventMarketV2Test is Test {
    MockERC20 usdc;
    EventMarketV2 market;

    address owner = makeAddr("owner"); // admin = creator
    address platform = makeAddr("platform");
    address creator;
    address alice = makeAddr("alice"); // the shock trader
    address bob = makeAddr("bob"); // the corrector
    address lp1 = makeAddr("lp1");

    uint256 constant INIT_LIQUIDITY = 100e6; // 100 USDC
    uint256 constant BPS = 10_000;
    uint256 constant PROB_ONE = 1e6;
    uint256 constant HALF = PROB_ONE / 2;
    uint256 constant ONE = 1e18; // netUsdcPerToken fixed-point scale

    uint16 constant BASE_FEE_BPS = 30; // 0.30%, straight to LPs
    uint16 constant PROTECTION_FEE_BPS = 70; // 0.70%, escrowed
    uint32 constant JUMP = 50_000; // 5 probability points
    uint32 constant CONTRIB = 10_000; // 1 probability point
    uint32 constant LOOKBACK = 5;
    uint32 constant OBSERVE = 5;
    uint32 constant COOLDOWN = 120;

    /// @dev Zero on purpose — the whole 1% is charged at the entry point, so an
    ///      in-curve swap fee on top would break "reverted flow costs 0.30%".
    uint256 constant LP_SWAP_FEE_BPS = 0;
    uint256 constant PLATFORM_FEE_BPS = 70; // 0.7% of totalCollateral at settle
    uint256 constant CREATOR_FEE_BPS = 30; // 0.3% of totalCollateral at settle

    uint256 bettingDeadline;
    uint256 resolveAfter;

    function setUp() public {
        vm.warp(10_000);
        bettingDeadline = block.timestamp + 1 days;
        resolveAfter = bettingDeadline + 2 hours;

        usdc = new MockERC20("USD Coin", "USDC", 6);

        creator = owner;

        market = _deployMarket();

        usdc.mint(alice, 500e6);
        usdc.mint(bob, 500e6);
        usdc.mint(lp1, 500e6);
    }

    /*//////////////////////////////////////////////////////////////
                              HELPERS
    //////////////////////////////////////////////////////////////*/

    function _buyYes(address who, uint256 amount) internal returns (uint256) {
        vm.startPrank(who);
        usdc.approve(address(market), amount);
        uint256 out = market.buyYes(amount, 0);
        vm.stopPrank();
        return out;
    }

    function _buyNo(address who, uint256 amount) internal returns (uint256) {
        vm.startPrank(who);
        usdc.approve(address(market), amount);
        uint256 out = market.buyNo(amount, 0);
        vm.stopPrank();
        return out;
    }

    function _trade(uint256 id) internal view returns (IEventMarketV2.Trade memory) {
        return market.getTrades(id, 1)[0];
    }

    function _shock(uint256 id) internal view returns (IEventMarketV2.Shock memory) {
        return market.getShocks(id, 1)[0];
    }

    /// @dev `public`, and called through `this` below, deliberately: decoding
    ///      getTrades' return array and encoding the assertion's arguments in one
    ///      frame overflows the IR stack by a slot, and an external self-call is
    ///      the only frame boundary the inliner cannot cross.
    function outcomeOf(uint256 id) public view returns (uint8) {
        return _trade(id).outcome;
    }

    function _assertOutcome(uint256 id, IEventMarketV2.TradeOutcome want, string memory why)
        internal
        view
    {
        assertEq(this.outcomeOf(id), uint8(want), why);
    }

    /// @dev This trade's own probability impact, signed. `+` pushed YES up.
    function _impact(uint256 id) internal view returns (int256) {
        IEventMarketV2.Trade memory t = _trade(id);
        return int256(uint256(t.pAfter)) - int256(uint256(t.pBefore));
    }

    function _os() internal view returns (IEventMarketV2.OddsShiftInfo memory) {
        return market.getOddsShiftInfo();
    }

    /// @dev getOddsShiftInfo / getUserOddsShift are the only readers the contract
    ///      has room for, so the per-field getters live here in the test instead.
    function _tradeCount() internal view returns (uint256) {
        return _os().totalTrades;
    }

    function _pending() internal view returns (uint256) {
        return _os().pendingCount;
    }

    function _shockCount() internal view returns (uint256) {
        return _os().totalShocks;
    }

    function _lpClaimable(address u) internal view returns (uint256) {
        return market.getUserOddsShift(u).lpRewardClaimable;
    }

    function _prob() internal view returns (uint64) {
        return _os().currentProb;
    }

    function _base(uint256 amount) internal pure returns (uint256) {
        return amount * BASE_FEE_BPS / BPS;
    }

    function _prot(uint256 amount) internal pure returns (uint256) {
        return amount * PROTECTION_FEE_BPS / BPS;
    }

    /// @dev usdc.balanceOf(market) must cover everything still owed. The
    ///      OddsShift liabilities are additive on top of the AMM's, which is the
    ///      whole point: settlement must never be able to spend escrow, and
    ///      escrow must never be able to fund a redemption.
    ///
    ///      Pre-settle the AMM owes `totalCollateral`. Post-settle it owes the
    ///      value of what has NOT been redeemed yet — `totalCollateral` stays
    ///      frozen after settlement because it is the denominator of
    ///      netUsdcPerToken, so it is not a liability figure any more.
    function _assertSolvent() internal view {
        uint256 owed =
            market.pendingEscrow() + market.totalRebateOwed() + market.totalLpRewardOwed();

        if (market.status() != IEventMarket.Status.Settled) {
            owed += market.totalCollateral();
        } else {
            address[4] memory actors = [creator, alice, bob, lp1];
            for (uint256 i = 0; i < actors.length; ++i) {
                owed += _settledClaimOf(actors[i]);
            }
        }

        assertGe(usdc.balanceOf(address(market)), owed, "market insolvent");
    }

    /// @dev What `a` can still pull out of a settled market: their own outcome
    ///      tokens plus, if they never claimed, their share of the reserves.
    ///      Kept in its own frame — inlined, the arithmetic overflows the IR
    ///      stack.
    function _settledClaimOf(address a) internal view returns (uint256 owed) {
        uint256 yRate = market.netUsdcPerYesToken();
        uint256 nRate = market.netUsdcPerNoToken();

        owed = market.yesBalanceOf(a) * yRate / ONE + market.noBalanceOf(a) * nRate / ONE;

        uint256 totalShares = market.totalLpShares();
        if (totalShares == 0 || market.lpClaimed(a)) return owed;

        // Mirror claimLpPayout's order of operations exactly, or rounding makes
        // the comparison meaningless.
        uint256 sh = market.lpShares(a);
        owed += (market.yesReserve() * sh / totalShares) * yRate / ONE;
        owed += (market.noReserve() * sh / totalShares) * nRate / ONE;
    }

    /// @dev The V1 invariants must survive the escrow bolt-on.
    function _assertAmmInvariants() internal view {
        address[4] memory actors = [creator, alice, bob, lp1];
        uint256 yesHeld;
        uint256 noHeld;
        for (uint256 i = 0; i < actors.length; ++i) {
            yesHeld += market.yesBalanceOf(actors[i]);
            noHeld += market.noBalanceOf(actors[i]);
        }
        assertEq(yesHeld + market.yesReserve(), market.totalCollateral(), "YES invariant");
        assertEq(noHeld + market.noReserve(), market.totalCollateral(), "NO invariant");
    }

    /// @dev Five trades that end 7.3 points above the anchor, so the window trips
    ///      on trade 4 — and with a deliberate mix of contributions:
    ///        0  alice buyYes 12  +5.6 pts   same direction, over  1 pt
    ///        1  bob   buyNo   3  -1.6 pts   COUNTER direction, over 1 pt
    ///        2  alice buyYes  1  +0.5 pts   same direction, under 1 pt
    ///        3  alice buyYes  1  +0.4 pts   same direction, under 1 pt
    ///        4  alice buyYes  3  +1.3 pts   same direction, over  1 pt
    function _runTieredWindow() internal {
        _buyYes(alice, 12e6);
        _buyNo(bob, 3e6);
        _buyYes(alice, 1e6);
        _buyYes(alice, 1e6);
        _buyYes(alice, 3e6);
    }

    /*//////////////////////////////////////////////////////////////
                          BASELINE / PLUMBING
    //////////////////////////////////////////////////////////////*/

    function test_InitialState() public view {
        assertEq(market.yesReserve(), INIT_LIQUIDITY);
        assertEq(market.noReserve(), INIT_LIQUIDITY);
        assertEq(market.totalCollateral(), INIT_LIQUIDITY);
        assertEq(market.totalLpShares(), INIT_LIQUIDITY);
        assertEq(market.lockedLpShares(creator), INIT_LIQUIDITY);
        assertEq(uint8(market.status()), uint8(IEventMarket.Status.Open));

        IEventMarketV2.OddsShiftInfo memory os = market.getOddsShiftInfo();
        assertEq(os.baseFeeBps, BASE_FEE_BPS);
        assertEq(os.protectionFeeBps, PROTECTION_FEE_BPS);
        assertEq(os.jumpThreshold, JUMP);
        assertEq(os.contribThreshold, CONTRIB);
        assertEq(os.lookback, LOOKBACK);
        assertEq(os.observeWindow, OBSERVE);
        assertEq(os.cooldown, COOLDOWN);
        assertEq(os.currentProb, HALF);
        assertEq(os.totalTrades, 0);
        assertEq(os.pendingCount, 0);
        assertEq(os.windowAnchorProb, 0, "no window forming yet");
        assertFalse(os.shockOpen);
    }

    /// The headline number: 1% at the entry, 0.30% of it already the LPs' and
    /// 0.70% escrowed. Neither slice is collateral.
    function test_FeeSplitAtEntry() public {
        uint256 spend = 12e6;

        _buyYes(alice, spend);

        assertEq(market.pendingEscrow(), _prot(spend), "0.70% escrowed");
        assertEq(_os().cumBaseFee, _base(spend), "0.30% banked");
        assertEq(
            _lpClaimable(creator), _base(spend), "base fee is the LPs' immediately"
        );
        assertEq(
            market.totalCollateral(),
            INIT_LIQUIDITY + spend - _base(spend) - _prot(spend),
            "only the net 99% entered the curve"
        );
        assertEq(usdc.balanceOf(address(market)), INIT_LIQUIDITY + spend, "all USDC stays here");
        assertEq(market.usdcInOf(alice), spend, "the trader really did pay the full 1%");

        IEventMarketV2.Trade memory t = _trade(0);
        assertEq(t.trader, alice);
        assertEq(t.escrow, _prot(spend));
        assertEq(t.pBefore, HALF, "pBefore is the pre-trade probability");
        assertGt(t.pAfter, t.pBefore, "buyYes pushes YES up");
        _assertOutcome(0, IEventMarketV2.TradeOutcome.Pending, "no verdict yet");
        assertGt(_impact(0), int256(uint256(JUMP)), "12 USDC is over 5 points on its own");

        _assertAmmInvariants();
        _assertSolvent();
    }

    function test_SellChargesBothFeeSlicesOnProceeds() public {
        _buyYes(alice, 12e6);
        uint256 yesBal = market.yesBalanceOf(alice);

        uint256 quoted = market.quoteSellYes(yesBal / 2);
        uint256 before = usdc.balanceOf(alice);
        uint256 escrowBefore = market.pendingEscrow();

        vm.prank(alice);
        uint256 got = market.sellYes(yesBal / 2, 0);

        assertEq(got, quoted, "quoteSellYes must match the net actually paid out");
        assertEq(usdc.balanceOf(alice) - before, got, "net transferred");

        // Trade 1 is the sell: selling YES pushes the YES probability down.
        IEventMarketV2.Trade memory t = _trade(1);
        assertLt(t.pAfter, t.pBefore);
        assertGt(t.escrow, 0);
        assertEq(market.pendingEscrow() - escrowBefore, t.escrow, "sell escrow is held too");

        _assertAmmInvariants();
        _assertSolvent();
    }

    /// @dev The single easiest bug to ship: a quote that ignores the entry fee
    ///      makes every trade revert on its own slippage check.
    function test_QuotesMatchActualFills() public {
        uint256 qYes = market.quoteYes(12e6);
        vm.startPrank(alice);
        usdc.approve(address(market), 12e6);
        assertEq(market.buyYes(12e6, qYes), qYes, "quoteYes must be exact");
        vm.stopPrank();

        uint256 qNo = market.quoteNo(9e6);
        vm.startPrank(bob);
        usdc.approve(address(market), 9e6);
        assertEq(market.buyNo(9e6, qNo), qNo, "quoteNo must be exact");
        vm.stopPrank();

        uint256 sell = market.noBalanceOf(bob) / 2;
        uint256 qSellNo = market.quoteSellNo(sell);
        vm.prank(bob);
        assertEq(market.sellNo(sell, qSellNo), qSellNo, "quoteSellNo must be exact");
    }

    /*//////////////////////////////////////////////////////////////
                         WINDOW DETECTION
    //////////////////////////////////////////////////////////////*/

    function test_WindowTripsOnFifthTradeAndRecordsTheShock() public {
        _runTieredWindow();

        assertEq(_shockCount(), 1, "exactly one shock");
        assertTrue(market.shockOpen(), "now observing");

        IEventMarketV2.Shock memory s = _shock(0);
        assertEq(s.firstId, 0, "window starts at the oldest pending trade");
        assertEq(s.triggerId, 4, "the fifth trade is the mark");
        assertEq(s.pAnchor, HALF, "anchor is the pre-trade probability of trade 0");
        assertEq(s.pShock, _trade(4).pAfter, "detected at the window's closing price");
        assertEq(s.dir, int8(1), "the jump pushed YES up");
        assertEq(uint8(s.outcome), uint8(IEventMarketV2.ShockOutcome.Open));
        assertGe(uint256(s.pShock) - uint256(s.pAnchor), JUMP, "net displacement >= 5 points");

        // Nothing is judged while a shock is open.
        assertEq(market.nextToResolve(), 0);
        assertEq(_pending(), 5);
        assertEq(market.totalRebateOwed(), 0);

        _assertAmmInvariants();
        _assertSolvent();
    }

    /// A window that never trips retires its oldest trade one at a time, so
    /// slow flow is never charged more than the 0.30% base fee.
    function test_TradeSlidingOutOfTheWindowIsRefunded() public {
        for (uint256 i = 0; i < 5; ++i) {
            _buyYes(alice, 1e6);
        }

        // Five 1 USDC buys move YES ~2.4 points in total — nowhere near 5.
        assertEq(_shockCount(), 0, "no shock");
        assertLt(uint256(_prob()) - HALF, JUMP);

        _assertOutcome(0, IEventMarketV2.TradeOutcome.RefundedNoShock, "slid out clean");
        assertEq(market.rebateClaimable(alice), _prot(1e6), "0.70% back");
        assertEq(market.nextToResolve(), 1);
        assertEq(_pending(), 4);

        // One more trade retires one more.
        _buyYes(alice, 1e6);
        _assertOutcome(1, IEventMarketV2.TradeOutcome.RefundedNoShock, "and the next");
        assertEq(market.rebateClaimable(alice), 2 * _prot(1e6));

        _assertSolvent();
    }

    /// The observation window is exclusive: a second dislocation cannot open a
    /// shock over trades that are already being judged.
    function test_NoSecondShockWhileObserving() public {
        _runTieredWindow();
        assertEq(_shockCount(), 1);

        // Four more big same-direction buys: on their own these would trip a
        // window several times over.
        for (uint256 i = 0; i < 4; ++i) {
            _buyYes(alice, 12e6);
            assertEq(_shockCount(), 1, "still exactly one shock");
            assertTrue(market.shockOpen());
        }
        assertEq(_pending(), 9, "window + 4 observation trades");
        _assertSolvent();
    }

    /*//////////////////////////////////////////////////////////////
                       REVERTED — FULL REFUND
    //////////////////////////////////////////////////////////////*/

    /// Demo act 2. A pushes the market 7.3 points, one corrector brings it back
    /// inside 5 points, and the whole window is refunded on the spot — the first
    /// observation trade that comes back closes the shock early.
    function test_RevertedShockRefundsTheWholeWindowEarly() public {
        _buyYes(alice, 12e6);
        for (uint256 i = 0; i < 4; ++i) {
            _buyYes(alice, 1e6);
        }
        assertTrue(market.shockOpen(), "marked on trade 4");

        _buyNo(bob, 6e6); // one corrector, the first observation trade

        IEventMarketV2.Shock memory s = _shock(0);
        assertEq(uint8(s.outcome), uint8(IEventMarketV2.ShockOutcome.Reverted));
        assertEq(s.pEnd, _trade(5).pAfter);
        assertEq(s.resolvedAt, 6, "closed by the very first observation trade");
        assertLt(uint256(s.pEnd) - HALF, JUMP, "back inside the threshold");
        assertFalse(market.shockOpen());

        for (uint256 i = 0; i < 5; ++i) {
            _assertOutcome(i, IEventMarketV2.TradeOutcome.RefundedReverted, "window refunded");
        }

        uint256 aliceProtection = _prot(12e6) + 4 * _prot(1e6);
        assertEq(market.rebateClaimable(alice), aliceProtection, "0.70% back on every trade");
        assertEq(_os().cumRebated, aliceProtection);
        assertEq(_os().cumChargedFee, 0, "LPs keep only the base fee");

        // The promise, in money: 16 USDC of flow pays 160,000 at the entry and
        // gets 112,000 back, so the kept fee is exactly 0.30%.
        assertEq(market.usdcInOf(alice), 16e6, "she really did pay the full 1%");
        assertEq(_base(16e6) + _prot(16e6), 160_000);
        assertEq(aliceProtection, _prot(16e6));
        assertEq(_base(16e6), 48_000, "0.30% of 16 USDC");

        // The corrector's own trade is still pending — it heads the next window.
        _assertOutcome(5, IEventMarketV2.TradeOutcome.Pending, "corrector not yet judged");
        assertEq(market.nextToResolve(), 5);
        assertEq(market.pendingEscrow(), _prot(6e6));
        assertEq(
            market.getOddsShiftInfo().windowAnchorProb,
            _trade(5).pBefore,
            "the next window re-anchors after the shock"
        );

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        market.claimRebate();
        assertEq(usdc.balanceOf(alice) - before, aliceProtection);
        assertEq(market.rebateClaimable(alice), 0);

        _assertAmmInvariants();
        _assertSolvent();
    }

    /*//////////////////////////////////////////////////////////////
                        TOXIC — TIERED CHARGE
    //////////////////////////////////////////////////////////////*/

    /// Demo act 1. The window trips, five observation trades go by without the
    /// market coming back, and only the trades that actually pushed it there
    /// forfeit their 0.70%.
    function test_ToxicShockChargesOnlySameDirectionContributors() public {
        _runTieredWindow();

        // Sanity-check the fixture before relying on it: the assertions below
        // are about the direction filter, not about the trade sizes.
        assertGt(_impact(0), int256(uint256(CONTRIB)), "trade 0 same direction, over 1 pt");
        assertLt(_impact(1), -int256(uint256(CONTRIB)), "trade 1 COUNTER direction, over 1 pt");
        assertLt(_impact(2), int256(uint256(CONTRIB)), "trade 2 under 1 pt");
        assertLt(_impact(3), int256(uint256(CONTRIB)), "trade 3 under 1 pt");
        assertGt(_impact(4), int256(uint256(CONTRIB)), "trade 4 same direction, over 1 pt");

        // Five observation trades, nobody pulls it back.
        for (uint256 i = 0; i < 5; ++i) {
            _buyYes(alice, 1e6);
        }

        IEventMarketV2.Shock memory s = _shock(0);
        assertEq(uint8(s.outcome), uint8(IEventMarketV2.ShockOutcome.Toxic));
        assertEq(s.resolvedAt, 10, "closed when the observation window ran out");
        assertGe(uint256(s.pEnd) - uint256(s.pAnchor), JUMP, "still displaced");
        assertFalse(market.shockOpen());

        _assertOutcome(0, IEventMarketV2.TradeOutcome.Charged, "caused the jump");
        _assertOutcome(1, IEventMarketV2.TradeOutcome.RefundedMinor, "CORRECTOR IS NOT PUNISHED");
        _assertOutcome(2, IEventMarketV2.TradeOutcome.RefundedMinor, "too small to blame");
        _assertOutcome(3, IEventMarketV2.TradeOutcome.RefundedMinor, "too small to blame");
        _assertOutcome(4, IEventMarketV2.TradeOutcome.Charged, "helped cause the jump");

        uint256 charged = _prot(12e6) + _prot(3e6); // trades 0 and 4

        // Trades 1, 2 and 3 of the window — plus trade 5. Closing the shock
        // re-anchors the next window at trade 5, and five 1 USDC observation
        // trades displace it by ~2 points, so its oldest trade retires clean.
        _assertOutcome(5, IEventMarketV2.TradeOutcome.RefundedNoShock, "re-anchored, then slid out");
        uint256 refunded = _prot(3e6) + 3 * _prot(1e6);

        assertEq(_os().cumChargedFee, charged, "forfeited to LPs");
        assertEq(_os().cumRebated, refunded, "returned to traders");
        assertEq(market.rebateClaimable(bob), _prot(3e6), "the corrector gets 0.70% back");

        // Charged trades paid the full 1%; everyone else paid 0.30%.
        assertEq(_lpClaimable(creator), _os().cumBaseFee + charged, "sole LP");

        uint256 before = usdc.balanceOf(creator);
        vm.prank(creator);
        market.claimLpReward();
        assertEq(usdc.balanceOf(creator) - before, _os().cumBaseFee + charged);
        assertEq(_lpClaimable(creator), 0);

        _assertAmmInvariants();
        _assertSolvent();
    }

    function test_ChargedFeeSplitsProRataBetweenLps() public {
        // lp1 matches the creator: a 50/50 split of everything LP-bound. Adding
        // equal amounts to both reserves of a 50/50 pool leaves the price alone.
        vm.startPrank(lp1);
        usdc.approve(address(market), INIT_LIQUIDITY);
        market.addLiquidity(INIT_LIQUIDITY);
        vm.stopPrank();
        assertEq(_prob(), HALF, "balanced injection into a balanced pool");

        // The jump threshold is coupled to pool depth: at 200 USDC it takes
        // ~21 USDC to move 5 points. See oddsshift_todos.md section 4.
        uint256 spend = 25e6;
        _buyYes(alice, spend);

        vm.warp(block.timestamp + COOLDOWN + 1);
        market.resolveStale();

        _assertOutcome(0, IEventMarketV2.TradeOutcome.Charged, "lone 5-point trade is toxic");

        uint256 owedEach = (_base(spend) + _prot(spend)) / 2;
        assertEq(_lpClaimable(creator), owedEach, "creator half");
        assertEq(_lpClaimable(lp1), owedEach, "lp1 half");

        _assertSolvent();
    }

    function test_ClaimRebateRevertsWithoutBalance() public {
        vm.prank(alice);
        vm.expectRevert(IEventMarketV2.NothingToClaim.selector);
        market.claimRebate();
    }

    function test_ClaimLpRewardRevertsWithoutBalance() public {
        vm.prank(creator);
        vm.expectRevert(IEventMarketV2.NothingToClaim.selector);
        market.claimLpReward();
    }

    /*//////////////////////////////////////////////////////////////
                            RESOLVE STALE
    //////////////////////////////////////////////////////////////*/

    function test_ResolveStaleRevertsBeforeCooldown() public {
        _buyYes(alice, 12e6);
        vm.expectRevert(IEventMarketV2.CooldownNotElapsed.selector);
        market.resolveStale();
    }

    function test_ResolveStaleRevertsOnEmptyQueue() public {
        vm.expectRevert(IEventMarketV2.NothingToResolve.selector);
        market.resolveStale();
    }

    /// Demo act 1, the short version: one 12 USDC trade moves YES 5.6 points and
    /// the market goes quiet. It can never fill a 5-trade window, so the time
    /// fallback marks the partial window and convicts it where it stands.
    function test_ResolveStaleConvictsALoneDisplacingTrade() public {
        _buyYes(alice, 12e6);
        assertEq(_pending(), 1);

        vm.warp(block.timestamp + COOLDOWN + 1);
        market.resolveStale(); // permissionless: anyone, not just the trader

        assertEq(_pending(), 0);
        assertEq(_shockCount(), 1, "the partial window was marked");

        IEventMarketV2.Shock memory s = _shock(0);
        assertEq(s.firstId, 0);
        assertEq(s.triggerId, 0, "a one-trade window");
        assertEq(uint8(s.outcome), uint8(IEventMarketV2.ShockOutcome.Toxic));

        _assertOutcome(0, IEventMarketV2.TradeOutcome.Charged, "nobody pulled it back");
        assertEq(market.rebateClaimable(alice), 0);
        assertEq(_lpClaimable(creator), _base(12e6) + _prot(12e6), "full 1% to LPs");
        assertEq(market.pendingEscrow(), 0);

        _assertSolvent();
    }

    /// The mirror case: a partial window that never displaced the market is
    /// refunded, not convicted.
    function test_ResolveStaleRefundsAnUndisplacedQueue() public {
        _buyYes(alice, 5e6);
        _buyNo(bob, 4e6);
        assertLt(uint256(_prob()) - HALF, JUMP, "market barely moved");

        vm.warp(block.timestamp + COOLDOWN + 1);
        market.resolveStale();

        assertEq(_shockCount(), 0, "nothing to mark");
        _assertOutcome(0, IEventMarketV2.TradeOutcome.RefundedNoShock, "");
        _assertOutcome(1, IEventMarketV2.TradeOutcome.RefundedNoShock, "");
        assertEq(market.rebateClaimable(alice), _prot(5e6));
        assertEq(market.rebateClaimable(bob), _prot(4e6));
        assertEq(market.pendingEscrow(), 0);

        _assertSolvent();
    }

    /// An open shock whose observation window never fills is decided at the
    /// current probability — here it had come back, so the window is refunded.
    function test_ResolveStaleClosesAnOpenShockAtTheCurrentPrice() public {
        _runTieredWindow();
        assertTrue(market.shockOpen());

        _buyNo(bob, 6e6); // brings it back, closing the shock as reverted
        assertFalse(market.shockOpen());

        // Trade 5 is now the head of a new, never-completed window.
        assertEq(_pending(), 1);
        vm.warp(block.timestamp + COOLDOWN + 1);
        market.resolveStale();

        assertEq(_pending(), 0);
        _assertOutcome(5, IEventMarketV2.TradeOutcome.RefundedNoShock, "corrector refunded");
        assertEq(market.pendingEscrow(), 0);
        _assertSolvent();
    }

    /*//////////////////////////////////////////////////////////////
                       QUEUE / LIFECYCLE INVARIANTS
    //////////////////////////////////////////////////////////////*/

    /// A window plus its observation period is the most that can ever be waiting
    /// for a verdict. That is what bounds the settlement flush loop.
    function test_PendingQueueStaysBounded() public {
        for (uint256 i = 0; i < 30; ++i) {
            if (i % 3 == 0) {
                _buyYes(alice, 6e6);
            } else if (i % 3 == 1) {
                _buyNo(bob, 5e5);
            } else {
                _buyYes(alice, 5e5);
            }
            assertLe(_pending(), LOOKBACK + OBSERVE, "queue must stay bounded");
        }
        assertEq(_tradeCount(), 30);
        _assertAmmInvariants();
        _assertSolvent();
    }

    function test_ResolveFlushesTheQueue() public {
        _runTieredWindow();
        _buyYes(alice, 1e6); // one observation trade, shock still open
        assertTrue(market.shockOpen());
        assertEq(_pending(), 6);

        vm.warp(bettingDeadline + 1);
        market.lock();
        vm.warp(resolveAfter + 1);

        vm.prank(owner);
        market.resolve(true, "Mexico won");

        assertEq(_pending(), 0, "no escrow left undecided after settlement");
        assertEq(market.pendingEscrow(), 0);
        assertFalse(market.shockOpen());
        // Still displaced at the close, so the window is toxic.
        assertEq(uint8(_shock(0).outcome), uint8(IEventMarketV2.ShockOutcome.Toxic));
        _assertOutcome(0, IEventMarketV2.TradeOutcome.Charged, "");
        _assertOutcome(1, IEventMarketV2.TradeOutcome.RefundedMinor, "corrector");
        _assertSolvent();
    }

    function test_EmergencyForceDrawFlushesTheQueue() public {
        _buyYes(alice, 12e6);

        vm.warp(bettingDeadline + 1);
        market.lock();
        vm.warp(resolveAfter + market.EMERGENCY_TIMELOCK() + 1);
        market.emergencyForceDraw();

        assertEq(_pending(), 0);
        assertEq(market.pendingEscrow(), 0);
        _assertSolvent();
    }

    /// Settlement pays out of collateral only; escrow must survive it untouched
    /// and still be claimable afterwards.
    function test_EscrowSurvivesSettlement() public {
        _buyYes(alice, 12e6);
        _buyNo(bob, 6e6); // pulls the market back, so nothing is toxic

        vm.warp(bettingDeadline + 1);
        market.lock();
        vm.warp(resolveAfter + 1);
        vm.prank(owner);
        market.resolve(true, "Mexico won");

        uint256 refund = market.rebateClaimable(alice);
        assertEq(refund, _prot(12e6), "refunded at the closing price");

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        market.claimRebate();
        assertEq(usdc.balanceOf(alice) - before, refund);

        // Winners can still redeem in full. Read the balance first — an inline
        // read would consume the prank before redeemYes ever runs.
        uint256 aliceYes = market.yesBalanceOf(alice);
        vm.prank(alice);
        market.redeemYes(aliceYes);
        _assertSolvent();
    }

    function test_RedeemPairIsNotADirectionalTrade() public {
        _buyYes(alice, 12e6);
        _buyNo(alice, 12e6);

        uint256 tradesBefore = _tradeCount();
        uint256 pair = market.yesBalanceOf(alice) < market.noBalanceOf(alice)
            ? market.yesBalanceOf(alice)
            : market.noBalanceOf(alice);

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        market.redeemPair(pair);

        assertEq(usdc.balanceOf(alice) - before, pair, "pair redeem is 1:1, no fee");
        assertEq(_tradeCount(), tradesBefore, "not a directional trade");
        _assertSolvent();
    }

    function test_AddLiquidityIsNotADirectionalTrade() public {
        uint256 tradesBefore = _tradeCount();
        vm.startPrank(lp1);
        usdc.approve(address(market), 50e6);
        market.addLiquidity(50e6);
        vm.stopPrank();
        assertEq(_tradeCount(), tradesBefore, "LP provision is not directional flow");
    }

    function test_GetUserOddsShiftReportsPendingEscrow() public {
        _buyYes(alice, 12e6);
        _buyYes(alice, 1e6);

        IEventMarketV2.OddsShiftUserState memory st = market.getUserOddsShift(alice);

        assertEq(st.tradeCount, 2);
        assertEq(st.pendingEscrow, _prot(12e6) + _prot(1e6));
        assertEq(st.rebateClaimable, 0);
        assertEq(st.lpRewardClaimable, 0, "alice is not an LP");
    }

    function test_GetTradesAndShocksClampAndRevert() public {
        _runTieredWindow();

        assertEq(market.getTrades(3, 99).length, 2, "count is clamped to the tail");
        assertEq(market.getTrades(5, 1).length, 0, "empty tail is not an error");
        assertEq(market.getShocks(0, 99).length, 1);

        vm.expectRevert(IEventMarketV2.BadRange.selector);
        market.getTrades(6, 1);

        vm.expectRevert(IEventMarketV2.BadRange.selector);
        market.getShocks(2, 1);
    }

    /*//////////////////////////////////////////////////////////////
                          PARAMETER VALIDATION
    //////////////////////////////////////////////////////////////*/

    function test_RevertsOnInvalidOddsShiftParams() public {
        EventMarketV2.Params memory p;

        // Nothing to escrow means nothing to judge.
        p = _params();
        p.protectionFeeBps = 0;
        _expectBadParams(p);

        // Total entry fee is capped at 10%.
        p = _params();
        p.protectionFeeBps = 1_001 - BASE_FEE_BPS;
        _expectBadParams(p);

        // The jump threshold has to be a real probability.
        p = _params();
        p.jumpThreshold = uint32(PROB_ONE);
        _expectBadParams(p);

        // A contribution bar above the jump bar could never be met by a window
        // that only just tripped, so a toxic window would go unpunished.
        p = _params();
        p.contribThreshold = JUMP + 1;
        _expectBadParams(p);

        // A 1-trade lookback measures nothing but the trade's own impact, which
        // contribThreshold already covers.
        p = _params();
        p.lookback = 1;
        _expectBadParams(p);

        // Zero observation trades would convict every window instantly.
        p = _params();
        p.observeWindow = 0;
        _expectBadParams(p);

        // A zero cooldown makes resolveStale a no-wait bypass of the window.
        p = _params();
        p.cooldown = 0;
        _expectBadParams(p);
    }

    function _expectBadParams(EventMarketV2.Params memory p) internal {
        vm.expectRevert(IEventMarketV2.InvalidOddsShiftParams.selector);
        new EventMarketV2(p);
    }

    /// @dev The demo ships without a factory: EventMarketV2Factory would embed
    ///      the market's ~24.4KB initcode and land past EIP-170, so it is not
    ///      deployable at any size the market can reach. Whoever runs
    ///      `new EventMarketV2` takes the factory role and may call
    ///      initializeMarket once — here the test contract, on-chain the
    ///      deployer EOA. Mirrors DeployEventMarketV2.s.sol.
    function _deployMarket() internal returns (EventMarketV2 m) {
        m = new EventMarketV2(_params());
        usdc.mint(address(this), INIT_LIQUIDITY);
        usdc.transfer(address(m), INIT_LIQUIDITY);
        m.initializeMarket(creator, INIT_LIQUIDITY);
    }

    /// @dev Field by field, not a struct literal: a literal evaluates all
    ///      eighteen fields before storing any of them, which is more than the
    ///      IR backend can keep on the stack.
    function _params() internal view returns (EventMarketV2.Params memory p) {
        p.usdc = address(usdc);
        p.admin = owner;
        p.creator = creator;
        p.platform = platform;
        p.question = "Mexico to win (90 min)";
        p.resolutionSource = "FIFA result";
        p.bettingDeadline = bettingDeadline;
        p.resolveAfter = resolveAfter;
        p.lpSwapFeeBps = LP_SWAP_FEE_BPS;
        p.platformFeeBps = PLATFORM_FEE_BPS;
        p.creatorFeeBps = CREATOR_FEE_BPS;
        p.baseFeeBps = BASE_FEE_BPS;
        p.protectionFeeBps = PROTECTION_FEE_BPS;
        p.jumpThreshold = JUMP;
        p.contribThreshold = CONTRIB;
        p.lookback = LOOKBACK;
        p.observeWindow = OBSERVE;
        p.cooldown = COOLDOWN;
    }
}
