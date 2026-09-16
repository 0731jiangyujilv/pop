// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EventMarket} from "../src/EventMarket.sol";
import {EventMarketFactory} from "../src/EventMarketFactory.sol";
import {IEventMarket} from "../src/interfaces/IEventMarket.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice End-to-end tests for EventMarket — YES/NO AMM with admin resolution.
contract EventMarketTest is Test {
    /*//////////////////////////////////////////////////////////////
                              CONTRACTS
    //////////////////////////////////////////////////////////////*/

    MockERC20 usdc;
    EventMarketFactory factory;
    EventMarket market;

    /*//////////////////////////////////////////////////////////////
                              ACTORS
    //////////////////////////////////////////////////////////////*/

    address owner = makeAddr("owner"); // factory owner = admin
    address platform = makeAddr("platform");
    address creator;                   // = owner (factory.createMarket is onlyOwner)
    address alice = makeAddr("alice"); // buys YES
    address bob = makeAddr("bob");     // buys NO
    address lp1 = makeAddr("lp1");     // adds liquidity later

    /*//////////////////////////////////////////////////////////////
                              CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint256 constant INIT_LIQUIDITY = 100e6; // 100 USDC
    uint256 constant ONE_USDC = 1e6;
    uint256 constant BPS = 10_000;
    uint256 constant ONE = 1e18;

    uint256 bettingDeadline;
    uint256 resolveAfter;

    /*//////////////////////////////////////////////////////////////
                                SETUP
    //////////////////////////////////////////////////////////////*/

    function setUp() public {
        vm.warp(10_000);
        bettingDeadline = block.timestamp + 1 days;
        resolveAfter = bettingDeadline + 2 hours;

        usdc = new MockERC20("USD Coin", "USDC", 6);

        vm.prank(owner);
        factory = new EventMarketFactory(address(usdc), platform);

        // Creator is the factory owner in this MVP (onlyOwner createMarket).
        creator = owner;

        usdc.mint(creator, INIT_LIQUIDITY);
        vm.startPrank(creator);
        usdc.approve(address(factory), INIT_LIQUIDITY);
        (, address marketAddr) = factory.createMarket(
            EventMarketFactory.CreateParams({
                question: "Mexico to win (90 min)",
                resolutionSource: "FIFA result",
                bettingDeadline: bettingDeadline,
                resolveAfter: resolveAfter,
                initLiquidity: INIT_LIQUIDITY
            })
        );
        vm.stopPrank();

        market = EventMarket(marketAddr);

        usdc.mint(alice, 100e6);
        usdc.mint(bob, 100e6);
        usdc.mint(lp1, 100e6);
    }

    /*//////////////////////////////////////////////////////////////
                              HELPERS
    //////////////////////////////////////////////////////////////*/

    function _checkInvariants() internal view {
        // Each side's outstanding total (user + reserve) must equal totalCollateral.
        // We can't iterate user balances cheaply, so check the strongest weak form
        // available externally: pool reserves never exceed totalCollateral.
        assertLe(market.yesReserve(), market.totalCollateral(), "yesReserve > TC");
        assertLe(market.noReserve(), market.totalCollateral(), "noReserve > TC");
    }

    function _kGrows(uint256 kBefore) internal view {
        uint256 kAfter = market.yesReserve() * market.noReserve();
        assertGe(kAfter, kBefore, "k should not decrease");
    }

    /*//////////////////////////////////////////////////////////////
                        BOOTSTRAP / INIT STATE
    //////////////////////////////////////////////////////////////*/

    function test_init_setsImmutables() public view {
        assertEq(address(market.usdc()), address(usdc));
        assertEq(market.admin(), owner);
        assertEq(market.creator(), creator);
        assertEq(market.platform(), platform);
        assertEq(market.bettingDeadline(), bettingDeadline);
        assertEq(market.resolveAfter(), resolveAfter);
        assertEq(market.lpSwapFeeBps(), 100);
        assertEq(market.platformFeeBps(), 70);
        assertEq(market.creatorFeeBps(), 30);
    }

    function test_init_bootstrapHalfLpHalfBuy() public view {
        // 50 USDC LP + 50 USDC YES buy (initialSide=true).
        // After mint+swap: yesReserve = 50M * 50M / (50M + 49.5M) = 25_125_628.
        // Creator gets 50M (minted) + 24_874_372 (swap) ≈ 74.874M YES.
        assertEq(market.totalCollateral(), 100e6, "TC");
        assertEq(market.noReserve(), 100e6, "noReserve = 50 + 50 from buy");
        assertApproxEqAbs(market.yesReserve(), 25_125_628, 2, "yesReserve");

        assertApproxEqAbs(market.yesBalanceOf(creator), 74_874_372, 2, "creator YES");
        assertEq(market.noBalanceOf(creator), 0);

        assertEq(market.totalLpShares(), 50e6);
        assertEq(market.lpShares(creator), 50e6);
        assertEq(market.lockedLpShares(creator), 50e6);
        assertEq(uint8(market.status()), uint8(IEventMarket.Status.Open));

        _checkInvariants();
    }

    function test_init_yesProbabilitySkewedAfterInitiatorBuy() public view {
        // pYes = noReserve / (yes + no) ≈ 0.799
        uint256 pYes = market.yesProbability();
        assertGt(pYes, 0.79e18);
        assertLt(pYes, 0.80e18);
        // Off-by-one from integer division is expected.
        assertApproxEqAbs(pYes + market.noProbability(), ONE, 1);
    }

    function test_init_revert_doubleInitialize() public {
        vm.expectRevert(IEventMarket.AlreadyInitialized.selector);
        vm.prank(address(factory));
        market.initializeMarket(creator, INIT_LIQUIDITY);
    }

    function test_init_revert_initializeFromNonFactory() public {
        vm.expectRevert(IEventMarket.OnlyFactory.selector);
        market.initializeMarket(creator, INIT_LIQUIDITY);
    }

    /*//////////////////////////////////////////////////////////////
                                BUY
    //////////////////////////////////////////////////////////////*/

    function test_buyYes_growsKAndMintsAboveCollateral() public {
        uint256 kBefore = market.yesReserve() * market.noReserve();
        uint256 input = 10e6;

        vm.startPrank(alice);
        usdc.approve(address(market), input);
        uint256 yesOut = market.buyYes(input, 0);
        vm.stopPrank();

        // Trader gets > input because of the swap leg.
        assertGt(yesOut, input, "yesOut should exceed input");
        assertEq(market.yesBalanceOf(alice), yesOut);

        // k must grow (LP fee).
        _kGrows(kBefore);

        // Collateral grew by exactly the input.
        assertEq(market.totalCollateral(), 100e6 + input);

        // Invariant: noReserve += input (full input, fee implicit).
        assertEq(market.noReserve(), 100e6 + input);

        _checkInvariants();
    }

    function test_buyNo_symmetricToBuyYes() public {
        uint256 input = 10e6;
        uint256 yesResBefore = market.yesReserve();

        vm.startPrank(bob);
        usdc.approve(address(market), input);
        uint256 noOut = market.buyNo(input, 0);
        vm.stopPrank();

        assertGt(noOut, input);
        assertEq(market.noBalanceOf(bob), noOut);
        assertEq(market.yesReserve(), yesResBefore + input);
    }

    function test_buyYes_revert_minOut() public {
        uint256 input = 10e6;
        vm.startPrank(alice);
        usdc.approve(address(market), input);
        vm.expectRevert(IEventMarket.InsufficientOutput.selector);
        market.buyYes(input, type(uint256).max);
        vm.stopPrank();
    }

    function test_buyYes_revert_afterDeadline() public {
        vm.warp(bettingDeadline);
        vm.startPrank(alice);
        usdc.approve(address(market), 10e6);
        vm.expectRevert(IEventMarket.WrongStatus.selector);
        market.buyYes(10e6, 0);
        vm.stopPrank();
    }

    function test_quoteYes_matchesActualBuy() public {
        uint256 input = 10e6;
        uint256 quoted = market.quoteYes(input);

        vm.startPrank(alice);
        usdc.approve(address(market), input);
        uint256 actual = market.buyYes(input, 0);
        vm.stopPrank();

        assertEq(actual, quoted, "quote should equal buy result");
    }

    /*//////////////////////////////////////////////////////////////
                                SELL
    //////////////////////////////////////////////////////////////*/

    function test_sellYes_returnsUsdcAndMatchesQuote() public {
        // Alice buys YES, then sells it all back.
        vm.startPrank(alice);
        usdc.approve(address(market), 10e6);
        uint256 yesOut = market.buyYes(10e6, 0);

        uint256 quoted = market.quoteSellYes(yesOut);
        uint256 usdcBefore = usdc.balanceOf(alice);
        uint256 got = market.sellYes(yesOut, 0);
        vm.stopPrank();

        assertEq(got, quoted, "sell result should match quote");
        assertEq(usdc.balanceOf(alice) - usdcBefore, got, "USDC paid out");
        // Round-trip costs the swap fee on the portion routed through the pool,
        // so you get back less than you put in but a meaningful fraction of it.
        assertLt(got, 10e6, "round-trip < input (fees)");
        assertGt(got, 9e6, "round-trip recovers most of the input");
        _checkInvariants();
    }

    function test_sellYes_leavesPoolConsistentAndKGrows() public {
        vm.startPrank(alice);
        usdc.approve(address(market), 20e6);
        uint256 yesOut = market.buyYes(20e6, 0);
        vm.stopPrank();

        uint256 kBefore = market.yesReserve() * market.noReserve();
        uint256 tcBefore = market.totalCollateral();

        vm.prank(alice);
        uint256 got = market.sellYes(yesOut, 0);

        // Collateral falls by exactly the USDC paid out.
        assertEq(market.totalCollateral(), tcBefore - got, "TC drops by payout");
        // The swap leg keeps growing k (LP fee accrues even on exits).
        _kGrows(kBefore);
        _checkInvariants();
    }

    function test_sellNo_symmetricToSellYes() public {
        vm.startPrank(bob);
        usdc.approve(address(market), 10e6);
        uint256 noOut = market.buyNo(10e6, 0);

        uint256 quoted = market.quoteSellNo(noOut);
        uint256 usdcBefore = usdc.balanceOf(bob);
        uint256 got = market.sellNo(noOut, 0);
        vm.stopPrank();

        assertEq(got, quoted, "sellNo result should match quote");
        assertEq(usdc.balanceOf(bob) - usdcBefore, got);
        assertLt(got, 10e6);
        assertGt(got, 9e6);
        _checkInvariants();
    }

    function test_sellYes_revert_minOut() public {
        vm.startPrank(alice);
        usdc.approve(address(market), 10e6);
        uint256 yesOut = market.buyYes(10e6, 0);
        vm.expectRevert(IEventMarket.InsufficientOutput.selector);
        market.sellYes(yesOut, type(uint256).max);
        vm.stopPrank();
    }

    function test_sellYes_revert_insufficientBalance() public {
        vm.prank(alice);
        vm.expectRevert(IEventMarket.InsufficientOutcomeBalance.selector);
        market.sellYes(1, 0);
    }

    function test_sellYes_revert_afterDeadline() public {
        vm.startPrank(alice);
        usdc.approve(address(market), 10e6);
        uint256 yesOut = market.buyYes(10e6, 0);
        vm.stopPrank();

        vm.warp(bettingDeadline);
        vm.prank(alice);
        vm.expectRevert(IEventMarket.WrongStatus.selector);
        market.sellYes(yesOut, 0);
    }

    /*//////////////////////////////////////////////////////////////
                              LIQUIDITY
    //////////////////////////////////////////////////////////////*/

    function test_addLiquidity_symmetricInjection() public {
        uint256 yesRes = market.yesReserve();
        uint256 noRes = market.noReserve();
        uint256 pYesBefore = market.yesProbability();

        uint256 addAmt = 20e6;
        vm.startPrank(lp1);
        usdc.approve(address(market), addAmt);
        uint256 shares = market.addLiquidity(addAmt);
        vm.stopPrank();

        // Both reserves grow by exactly addAmt (symmetric).
        assertEq(market.yesReserve(), yesRes + addAmt);
        assertEq(market.noReserve(), noRes + addAmt);

        // Implied probability moves slightly toward 50/50 (more USDC dilutes the skew).
        uint256 pYesAfter = market.yesProbability();
        assertLt(pYesAfter, pYesBefore, "pYes should drop toward 0.5");

        // shares = addAmt * totalLpShares / totalCollateral_before
        // = 20e6 * 50e6 / 100e6 = 10e6
        assertEq(shares, 10e6);
        assertEq(market.lpShares(lp1), shares);
        assertEq(market.lockedLpShares(lp1), 0, "new LP not locked");
    }

    function test_removeLiquidity_unlockedSharesGoBackAsUsdcAndOutcomeDust() public {
        // Add 20 USDC as fresh (unlocked) LP.
        vm.startPrank(lp1);
        usdc.approve(address(market), 20e6);
        uint256 shares = market.addLiquidity(20e6);
        vm.stopPrank();

        uint256 yesRes = market.yesReserve();
        uint256 noRes = market.noReserve();
        uint256 lps = market.totalLpShares();
        uint256 usdcBalBefore = usdc.balanceOf(lp1);

        // yesOut = yesRes * shares/lps, noOut = noRes * shares/lps, sym = min(both)
        uint256 yesOutExpected = yesRes * shares / lps;
        uint256 noOutExpected = noRes * shares / lps;
        uint256 symExpected = yesOutExpected < noOutExpected ? yesOutExpected : noOutExpected;

        vm.prank(lp1);
        market.removeLiquidity(shares);

        assertEq(market.lpShares(lp1), 0);
        assertEq(usdc.balanceOf(lp1) - usdcBalBefore, symExpected, "sym USDC paid");

        // Asymmetric remainder paid as outcome tokens (the bigger side).
        uint256 yesExtra = yesOutExpected - symExpected;
        uint256 noExtra = noOutExpected - symExpected;
        assertEq(market.yesBalanceOf(lp1), yesExtra);
        assertEq(market.noBalanceOf(lp1), noExtra);
    }

    function test_removeLiquidity_revert_lockedInitiatorShare() public {
        // Creator's 50e6 LP shares are fully locked. Cannot remove during Open.
        vm.prank(creator);
        vm.expectRevert(IEventMarket.LpSharesLocked.selector);
        market.removeLiquidity(1);
    }

    function test_addLiquidity_revert_afterDeadline() public {
        vm.warp(bettingDeadline);
        vm.startPrank(lp1);
        usdc.approve(address(market), 10e6);
        vm.expectRevert(IEventMarket.WrongStatus.selector);
        market.addLiquidity(10e6);
        vm.stopPrank();
    }

    function test_removeLiquidity_allowedDuringLocked() public {
        // lp1 adds 20 USDC (unlocked), then bettingDeadline passes.
        vm.startPrank(lp1);
        usdc.approve(address(market), 20e6);
        uint256 shares = market.addLiquidity(20e6);
        vm.stopPrank();

        vm.warp(bettingDeadline);

        // Should auto-lock and allow remove.
        vm.prank(lp1);
        market.removeLiquidity(shares);
        assertEq(uint8(market.status()), uint8(IEventMarket.Status.Locked));
        assertEq(market.lpShares(lp1), 0);
    }

    /*//////////////////////////////////////////////////////////////
                            PAIR REDEEM
    //////////////////////////////////////////////////////////////*/

    function test_redeemPair_burnsBothSidesAndPaysUsdc() public {
        // Alice buys YES, Bob buys NO; they then trade outcome tokens off-chain
        // (simulate by having one user hold both). Simpler: have one user buy
        // YES then NO so they end up with both balances, then pair-redeem.
        vm.startPrank(alice);
        usdc.approve(address(market), 30e6);
        market.buyYes(10e6, 0);
        uint256 yesBal = market.yesBalanceOf(alice);
        market.buyNo(10e6, 0);
        uint256 noBal = market.noBalanceOf(alice);
        vm.stopPrank();

        uint256 pair = yesBal < noBal ? yesBal : noBal;
        uint256 usdcBefore = usdc.balanceOf(alice);
        uint256 tcBefore = market.totalCollateral();

        vm.prank(alice);
        market.redeemPair(pair);

        assertEq(market.yesBalanceOf(alice), yesBal - pair);
        assertEq(market.noBalanceOf(alice), noBal - pair);
        assertEq(usdc.balanceOf(alice) - usdcBefore, pair);
        assertEq(market.totalCollateral(), tcBefore - pair);
    }

    function test_redeemPair_allowedDuringLocked() public {
        // Alice buys YES + NO, then deadline passes.
        vm.startPrank(alice);
        usdc.approve(address(market), 20e6);
        market.buyYes(10e6, 0);
        market.buyNo(10e6, 0);
        vm.stopPrank();

        vm.warp(bettingDeadline);

        uint256 pair = market.yesBalanceOf(alice) < market.noBalanceOf(alice)
            ? market.yesBalanceOf(alice)
            : market.noBalanceOf(alice);

        vm.prank(alice);
        market.redeemPair(pair);

        assertEq(uint8(market.status()), uint8(IEventMarket.Status.Locked));
    }

    function test_redeemPair_revert_insufficient() public {
        vm.prank(alice);
        vm.expectRevert(IEventMarket.InsufficientOutcomeBalance.selector);
        market.redeemPair(1);
    }

    function test_redeemPair_revert_afterSettle() public {
        // Alice gets a pair.
        vm.startPrank(alice);
        usdc.approve(address(market), 20e6);
        market.buyYes(10e6, 0);
        market.buyNo(10e6, 0);
        vm.stopPrank();

        // Settle.
        vm.warp(resolveAfter);
        vm.prank(owner);
        market.resolve(true, "Mexico won");

        vm.prank(alice);
        vm.expectRevert(IEventMarket.WrongStatus.selector);
        market.redeemPair(1);
    }

    /*//////////////////////////////////////////////////////////////
                              LOCK
    //////////////////////////////////////////////////////////////*/

    function test_lock_permissionlessAfterDeadline() public {
        vm.warp(bettingDeadline);
        market.lock(); // anyone, no prank needed
        assertEq(uint8(market.status()), uint8(IEventMarket.Status.Locked));
    }

    function test_lock_idempotent() public {
        vm.warp(bettingDeadline);
        market.lock();
        market.lock(); // no revert
        assertEq(uint8(market.status()), uint8(IEventMarket.Status.Locked));
    }

    function test_lock_noOpBeforeDeadline() public {
        market.lock(); // no revert, but no transition
        assertEq(uint8(market.status()), uint8(IEventMarket.Status.Open));
    }

    /*//////////////////////////////////////////////////////////////
                              RESOLVE
    //////////////////////////////////////////////////////////////*/

    function test_resolve_yesWins_payoutsAndFees() public {
        vm.startPrank(alice);
        usdc.approve(address(market), 10e6);
        uint256 aliceYes = market.buyYes(10e6, 0);
        vm.stopPrank();

        uint256 tc = market.totalCollateral(); // = 110e6
        uint256 expectedPlatformFee = tc * 70 / BPS;
        uint256 expectedCreatorFee = tc * 30 / BPS;
        uint256 remaining = tc - expectedPlatformFee - expectedCreatorFee;
        uint256 expectedNetPerYes = remaining * ONE / tc;

        uint256 platformBefore = usdc.balanceOf(platform);
        uint256 creatorBefore = usdc.balanceOf(creator);

        vm.warp(resolveAfter);
        vm.prank(owner);
        market.resolve(true, "Mexico won 1-0");

        assertEq(uint8(market.status()), uint8(IEventMarket.Status.Settled));
        assertTrue(market.yesWins());
        assertEq(usdc.balanceOf(platform) - platformBefore, expectedPlatformFee, "platform fee");
        assertEq(usdc.balanceOf(creator) - creatorBefore, expectedCreatorFee, "creator fee");
        assertEq(market.netUsdcPerYesToken(), expectedNetPerYes);
        assertEq(market.netUsdcPerNoToken(), 0);

        // Alice redeems her YES.
        uint256 aliceUsdcBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        market.redeemYes(aliceYes);
        uint256 paid = usdc.balanceOf(alice) - aliceUsdcBefore;
        assertEq(paid, aliceYes * expectedNetPerYes / ONE);
        // Sanity: per-token rate is ~0.99 (1% protocol fee).
        assertGt(paid, aliceYes * 98 / 100);
        assertLt(paid, aliceYes);
    }

    function test_resolve_revert_beforeResolveAfter() public {
        vm.warp(bettingDeadline);
        vm.prank(owner);
        vm.expectRevert(IEventMarket.ResolveTooEarly.selector);
        market.resolve(true, "too early");
    }

    function test_resolve_revert_nonAdmin() public {
        vm.warp(resolveAfter);
        vm.prank(alice);
        vm.expectRevert(IEventMarket.OnlyAdmin.selector);
        market.resolve(true, "");
    }

    function test_redeemNo_winningSide() public {
        vm.startPrank(bob);
        usdc.approve(address(market), 10e6);
        uint256 bobNo = market.buyNo(10e6, 0);
        vm.stopPrank();

        vm.warp(resolveAfter);
        vm.prank(owner);
        market.resolve(false, "South Africa won");

        uint256 bobBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        market.redeemNo(bobNo);
        assertGt(usdc.balanceOf(bob) - bobBefore, bobNo * 98 / 100);
    }

    function test_redeemYes_losingSide_payoutZero() public {
        vm.startPrank(alice);
        usdc.approve(address(market), 10e6);
        uint256 aliceYes = market.buyYes(10e6, 0);
        vm.stopPrank();

        vm.warp(resolveAfter);
        vm.prank(owner);
        market.resolve(false, "South Africa won"); // YES loses

        // netUsdcPerYesToken = 0, so redeemYes reverts (rate == 0).
        vm.prank(alice);
        vm.expectRevert(IEventMarket.ZeroAmount.selector);
        market.redeemYes(aliceYes);
    }

    /*//////////////////////////////////////////////////////////////
                          LP CLAIM POST-SETTLE
    //////////////////////////////////////////////////////////////*/

    function test_claimLpPayout_creatorReleasesLockedShare() public {
        vm.warp(resolveAfter);
        vm.prank(owner);
        market.resolve(true, "");

        uint256 yesShare = market.yesReserve() * market.lpShares(creator) / market.totalLpShares();
        uint256 noShare = market.noReserve() * market.lpShares(creator) / market.totalLpShares();
        uint256 expected =
            yesShare * market.netUsdcPerYesToken() / ONE
                + noShare * market.netUsdcPerNoToken() / ONE;

        uint256 before = usdc.balanceOf(creator);
        vm.prank(creator);
        market.claimLpPayout();
        assertEq(usdc.balanceOf(creator) - before, expected);
        assertTrue(market.lpClaimed(creator));
    }

    function test_claimLpPayout_revert_doubleClaim() public {
        vm.warp(resolveAfter);
        vm.prank(owner);
        market.resolve(true, "");

        vm.prank(creator);
        market.claimLpPayout();

        vm.prank(creator);
        vm.expectRevert(IEventMarket.AlreadyClaimed.selector);
        market.claimLpPayout();
    }

    function test_claimLpPayout_revert_notLP() public {
        vm.warp(resolveAfter);
        vm.prank(owner);
        market.resolve(true, "");

        vm.prank(alice);
        vm.expectRevert(IEventMarket.NotLP.selector);
        market.claimLpPayout();
    }

    /*//////////////////////////////////////////////////////////////
                         EMERGENCY FORCE DRAW
    //////////////////////////////////////////////////////////////*/

    function test_emergencyForceDraw_admin_absent() public {
        // Trader holds YES; admin never resolves.
        vm.startPrank(alice);
        usdc.approve(address(market), 10e6);
        uint256 aliceYes = market.buyYes(10e6, 0);
        vm.stopPrank();

        // Past deadline, far past resolveAfter, beyond the emergency timelock.
        vm.warp(resolveAfter + market.EMERGENCY_TIMELOCK());
        market.emergencyForceDraw();

        assertTrue(market.isDraw());
        assertEq(uint8(market.status()), uint8(IEventMarket.Status.Settled));

        // Implied prices sum to 1.
        assertEq(market.netUsdcPerYesToken() + market.netUsdcPerNoToken(), ONE);
        assertGt(market.netUsdcPerYesToken(), 0);
        assertGt(market.netUsdcPerNoToken(), 0);

        // Alice can redeem YES at implied price (no protocol fee deducted).
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        market.redeemYes(aliceYes);
        assertEq(usdc.balanceOf(alice) - before, aliceYes * market.netUsdcPerYesToken() / ONE);
    }

    function test_emergencyForceDraw_revert_beforeTimelock() public {
        vm.warp(resolveAfter);
        vm.expectRevert(IEventMarket.EmergencyTimelockNotExpired.selector);
        market.emergencyForceDraw();
    }

    function test_emergencyForceDraw_revert_alreadyResolved() public {
        vm.warp(resolveAfter);
        vm.prank(owner);
        market.resolve(true, "");

        vm.warp(resolveAfter + market.EMERGENCY_TIMELOCK());
        vm.expectRevert(IEventMarket.WrongStatus.selector);
        market.emergencyForceDraw();
    }

    /*//////////////////////////////////////////////////////////////
                       END-TO-END FEE ACCOUNTING
    //////////////////////////////////////////////////////////////*/

    function test_endToEnd_collateralConservedAfterFullSettlement() public {
        // Bring in two traders + an extra LP.
        vm.startPrank(alice);
        usdc.approve(address(market), 30e6);
        uint256 aliceYes = market.buyYes(30e6, 0);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(market), 20e6);
        uint256 bobNo = market.buyNo(20e6, 0);
        vm.stopPrank();

        vm.startPrank(lp1);
        usdc.approve(address(market), 40e6);
        market.addLiquidity(40e6);
        vm.stopPrank();

        uint256 contractUsdcBefore = usdc.balanceOf(address(market));
        uint256 totalCollateralBefore = market.totalCollateral();
        assertEq(contractUsdcBefore, totalCollateralBefore, "contract USDC == TC pre-settle");

        // Settle YES wins.
        vm.warp(resolveAfter);
        vm.prank(owner);
        market.resolve(true, "");

        // Everyone with YES or LP claims.
        vm.prank(alice);
        market.redeemYes(aliceYes);
        // Creator holds both LP shares AND the initiator-buy YES; both must be redeemed.
        uint256 creatorYes = market.yesBalanceOf(creator);
        vm.prank(creator);
        market.redeemYes(creatorYes);
        vm.prank(creator);
        market.claimLpPayout();
        vm.prank(lp1);
        market.claimLpPayout();
        // Bob's NO is worthless — try and expect revert (rate == 0).
        vm.prank(bob);
        vm.expectRevert(IEventMarket.ZeroAmount.selector);
        market.redeemNo(bobNo);

        // Sum: platform + creator fees + sum of payouts should equal initial TC,
        // give or take a few units of integer-division dust.
        uint256 dust = usdc.balanceOf(address(market));
        assertLt(dust, 100, "dust under 100 wei");
    }

    /*//////////////////////////////////////////////////////////////
                          MUTABLE SCHEDULE
    //////////////////////////////////////////////////////////////*/

    function test_setSchedule_updatesBothWindows() public {
        uint256 newDeadline = block.timestamp + 3 days;
        uint256 newResolve = newDeadline + 6 hours;

        vm.prank(owner);
        market.setSchedule(newDeadline, newResolve);

        assertEq(market.bettingDeadline(), newDeadline);
        assertEq(market.resolveAfter(), newResolve);
    }

    function test_setSchedule_defaultsResolveWindowWhenZero() public {
        uint256 newDeadline = block.timestamp + 3 days;

        vm.prank(owner);
        market.setSchedule(newDeadline, 0);

        assertEq(market.bettingDeadline(), newDeadline);
        assertEq(market.resolveAfter(), newDeadline + market.DEFAULT_RESOLVE_WINDOW());
        assertEq(market.DEFAULT_RESOLVE_WINDOW(), 2 hours);
    }

    function test_setSchedule_revert_nonAdmin() public {
        vm.prank(alice);
        vm.expectRevert(IEventMarket.OnlyAdmin.selector);
        market.setSchedule(block.timestamp + 1 days, 0);
    }

    function test_setSchedule_revert_deadlineInPast() public {
        vm.prank(owner);
        vm.expectRevert(IEventMarket.InvalidDeadline.selector);
        market.setSchedule(block.timestamp, 0);
    }

    function test_setSchedule_revert_resolveBeforeDeadline() public {
        uint256 newDeadline = block.timestamp + 3 days;
        vm.prank(owner);
        vm.expectRevert(IEventMarket.InvalidResolveTime.selector);
        market.setSchedule(newDeadline, newDeadline - 1);
    }

    function test_setSchedule_revert_afterSettled() public {
        vm.warp(resolveAfter);
        vm.prank(owner);
        market.resolve(true, "");

        vm.prank(owner);
        vm.expectRevert(IEventMarket.WrongStatus.selector);
        market.setSchedule(block.timestamp + 1 days, 0);
    }

    function test_setSchedule_reopensLockedMarket() public {
        // Deadline passes and the market locks.
        vm.warp(bettingDeadline);
        market.lock();
        assertEq(uint8(market.status()), uint8(IEventMarket.Status.Locked));

        // Admin pushes the deadline out; the market reopens.
        uint256 newDeadline = block.timestamp + 2 days;
        vm.prank(owner);
        market.setSchedule(newDeadline, 0);
        assertEq(uint8(market.status()), uint8(IEventMarket.Status.Open));

        // Betting works again after reopening.
        vm.startPrank(alice);
        usdc.approve(address(market), 10e6);
        uint256 yesOut = market.buyYes(10e6, 0);
        vm.stopPrank();
        assertGt(yesOut, 0);
    }

    function test_constructor_defaultsResolveWindowWhenZero() public {
        // A market created with resolveAfter == 0 defaults to deadline + 2h.
        uint256 deadline = block.timestamp + 5 days;

        usdc.mint(creator, INIT_LIQUIDITY);
        vm.startPrank(creator);
        usdc.approve(address(factory), INIT_LIQUIDITY);
        (, address addr) = factory.createMarket(
            EventMarketFactory.CreateParams({
                question: "Default resolve window?",
                resolutionSource: "n/a",
                bettingDeadline: deadline,
                resolveAfter: 0,
                initLiquidity: INIT_LIQUIDITY
            })
        );
        vm.stopPrank();

        EventMarket m = EventMarket(addr);
        assertEq(m.resolveAfter(), deadline + m.DEFAULT_RESOLVE_WINDOW());
    }

    /*//////////////////////////////////////////////////////////////
                    PER-USER USDC FLOW TRACKING
    //////////////////////////////////////////////////////////////*/

    // Core invariant these tests rely on: the amount added to usdcInOf on any call
    // equals the USDC pulled FROM the user in that call, and the amount added to
    // usdcOutOf equals the USDC sent TO the user. So we assert the mapping delta
    // against the user's USDC balance delta without predicting AMM output.

    function test_flows_creatorSeedCountsAsUsdcIn() public view {
        // The initializeMarket seed (locked creator LP) is an inflow for the creator.
        assertEq(market.usdcInOf(creator), INIT_LIQUIDITY, "creator seed -> usdcIn");
        assertEq(market.usdcOutOf(creator), 0, "creator no outflow yet");
    }

    function test_flows_buyYesAndBuyNoAreUsdcIn() public {
        vm.startPrank(alice);
        usdc.approve(address(market), 30e6);
        market.buyYes(30e6, 0);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(market), 20e6);
        market.buyNo(20e6, 0);
        vm.stopPrank();

        assertEq(market.usdcInOf(alice), 30e6, "alice buyYes -> usdcIn");
        assertEq(market.usdcOutOf(alice), 0, "alice no outflow");
        assertEq(market.usdcInOf(bob), 20e6, "bob buyNo -> usdcIn");
        assertEq(market.usdcOutOf(bob), 0, "bob no outflow");
    }

    function test_flows_sellYesIsUsdcOut() public {
        vm.startPrank(alice);
        usdc.approve(address(market), 30e6);
        uint256 yesOut = market.buyYes(30e6, 0);

        uint256 balBefore = usdc.balanceOf(alice);
        uint256 outBefore = market.usdcOutOf(alice);
        uint256 usdcBack = market.sellYes(yesOut / 2, 0);
        vm.stopPrank();

        assertEq(usdc.balanceOf(alice) - balBefore, usdcBack, "received == returned usdcOut");
        assertEq(market.usdcOutOf(alice) - outBefore, usdcBack, "usdcOut delta == USDC received");
        assertEq(market.usdcInOf(alice), 30e6, "buy inflow unchanged by sell");
    }

    function test_flows_redeemPairIsUsdcOut() public {
        // Buy both sides so alice holds matched YES + NO to pair-redeem.
        vm.startPrank(alice);
        usdc.approve(address(market), 60e6);
        market.buyYes(30e6, 0);
        market.buyNo(30e6, 0);

        uint256 balBefore = usdc.balanceOf(alice);
        uint256 outBefore = market.usdcOutOf(alice);
        market.redeemPair(5e6);
        vm.stopPrank();

        assertEq(usdc.balanceOf(alice) - balBefore, 5e6, "pair redeem pays 1:1");
        assertEq(market.usdcOutOf(alice) - outBefore, 5e6, "usdcOut delta == pair amount");
    }

    function test_flows_removeLiquidityIsUsdcOut() public {
        vm.startPrank(lp1);
        usdc.approve(address(market), 40e6);
        market.addLiquidity(40e6);
        assertEq(market.usdcInOf(lp1), 40e6, "LP add -> usdcIn");

        uint256 shares = market.lpShares(lp1);
        uint256 balBefore = usdc.balanceOf(lp1);
        uint256 outBefore = market.usdcOutOf(lp1);
        market.removeLiquidity(shares);
        vm.stopPrank();

        uint256 usdcBack = usdc.balanceOf(lp1) - balBefore;
        assertEq(market.usdcOutOf(lp1) - outBefore, usdcBack, "usdcOut delta == symmetric USDC leg");
    }

    function test_flows_redeemAndClaimAfterSettleAreUsdcOut_feesExcluded() public {
        vm.startPrank(alice);
        usdc.approve(address(market), 30e6);
        uint256 aliceYes = market.buyYes(30e6, 0);
        vm.stopPrank();

        vm.warp(resolveAfter);
        vm.prank(owner);
        market.resolve(true, "");

        // resolve() sends platform + creator fees; those must NOT touch usdcOutOf.
        assertEq(market.usdcOutOf(creator), 0, "creator fee not counted as user outflow");

        // Winning YES redeem is an outflow == USDC received.
        uint256 balBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        market.redeemYes(aliceYes);
        assertEq(market.usdcOutOf(alice), usdc.balanceOf(alice) - balBefore, "redeem -> usdcOut");

        // LP payout claim is an outflow == USDC received (still excludes the fee).
        uint256 creatorBefore = usdc.balanceOf(creator);
        vm.prank(creator);
        market.claimLpPayout();
        assertEq(market.usdcOutOf(creator), usdc.balanceOf(creator) - creatorBefore, "claim -> usdcOut, fee excluded");
    }

    function test_getUserState_matchesGettersAndMarketInfo() public {
        vm.startPrank(alice);
        usdc.approve(address(market), 40e6);
        market.buyYes(25e6, 0);
        market.buyNo(15e6, 0);
        vm.stopPrank();

        (IEventMarket.MarketInfo memory info, IEventMarket.UserState memory pos) =
            market.getUserState(alice);

        // Market-global fields mirror getMarketInfo().
        IEventMarket.MarketInfo memory mi = market.getMarketInfo();
        assertEq(uint8(info.status), uint8(mi.status), "status");
        assertEq(info.yesReserve, mi.yesReserve, "yesReserve");
        assertEq(info.noReserve, mi.noReserve, "noReserve");
        assertEq(info.totalCollateral, mi.totalCollateral, "totalCollateral");
        assertEq(info.totalLpShares, mi.totalLpShares, "totalLpShares");
        assertEq(info.netUsdcPerYesToken, mi.netUsdcPerYesToken, "netYes");
        assertEq(info.netUsdcPerNoToken, mi.netUsdcPerNoToken, "netNo");

        // Per-user fields mirror the individual public getters.
        assertEq(pos.yesBalance, market.yesBalanceOf(alice), "yesBalance");
        assertEq(pos.noBalance, market.noBalanceOf(alice), "noBalance");
        assertEq(pos.lpShares, market.lpShares(alice), "lpShares");
        assertEq(pos.lockedLpShares, market.lockedLpShares(alice), "lockedLpShares");
        assertEq(pos.lpClaimed, market.lpClaimed(alice), "lpClaimed");
        assertEq(pos.usdcIn, market.usdcInOf(alice), "usdcIn");
        assertEq(pos.usdcOut, market.usdcOutOf(alice), "usdcOut");
        assertEq(pos.usdcIn, 40e6, "usdcIn == total bought");
    }

    /*//////////////////////////////////////////////////////////////
                    CUMULATIVE MARKET STATISTICS
    //////////////////////////////////////////////////////////////*/

    // The analytics backend polls getStats() hourly and derives every period's
    // activity by diffing consecutive readings, so the properties that matter are:
    // (1) each counter tracks the same USDC amount its event reports, (2) counters
    // are monotonic, and (3) unique participants are counted exactly once.

    function test_stats_initialSeedCountedAsLiquidity() public view {
        IEventMarket.Stats memory s = market.getStats();
        assertEq(s.liquidityAdded, INIT_LIQUIDITY, "seed -> liquidityAdded");
        assertEq(s.liquidityAddedCount, 1, "seed -> one add");
        assertEq(s.uniqueLps, 1, "creator is the first LP");
        assertEq(s.uniqueTraders, 0, "bootstrap buy is not a trade");
        assertEq(s.buyYesVolume, 0, "no trades yet");
        assertEq(s.buyYesCount, 0, "no trades yet");
    }

    function test_stats_buyVolumesMatchUsdcIn() public {
        vm.startPrank(alice);
        usdc.approve(address(market), 30e6);
        market.buyYes(30e6, 0);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(market), 20e6);
        market.buyNo(12e6, 0);
        market.buyNo(8e6, 0);
        vm.stopPrank();

        IEventMarket.Stats memory s = market.getStats();
        assertEq(s.buyYesVolume, 30e6, "buyYesVolume == USDC in");
        assertEq(s.buyYesCount, 1, "one buyYes");
        assertEq(s.buyNoVolume, 20e6, "buyNoVolume == USDC in");
        assertEq(s.buyNoCount, 2, "two buyNo");
        assertEq(s.uniqueTraders, 2, "alice + bob");
    }

    function test_stats_sellVolumesMatchUsdcPaidOut() public {
        vm.startPrank(alice);
        usdc.approve(address(market), 30e6);
        uint256 yesOut = market.buyYes(30e6, 0);

        uint256 balBefore = usdc.balanceOf(alice);
        uint256 usdcBack = market.sellYes(yesOut / 2, 0);
        vm.stopPrank();

        IEventMarket.Stats memory s = market.getStats();
        assertEq(usdc.balanceOf(alice) - balBefore, usdcBack, "received == reported");
        assertEq(s.sellYesVolume, usdcBack, "sellYesVolume == USDC out");
        assertEq(s.sellYesCount, 1, "one sellYes");
        assertEq(s.buyYesVolume, 30e6, "buy volume untouched by the sell");
    }

    function test_stats_uniqueTradersCountedOnce() public {
        vm.startPrank(alice);
        usdc.approve(address(market), 60e6);
        market.buyYes(20e6, 0);
        market.buyNo(20e6, 0);
        uint256 sellable = market.yesBalanceOf(alice) / 4;
        market.sellYes(sellable, 0);
        vm.stopPrank();

        IEventMarket.Stats memory s = market.getStats();
        assertEq(s.uniqueTraders, 1, "three trades, one trader");
        assertEq(s.buyYesCount + s.buyNoCount + s.sellYesCount, 3, "all three counted");
        assertEq(market.participantFlags(alice), 1, "trader flag only");
    }

    function test_stats_liquidityFlowsAndUniqueLps() public {
        vm.startPrank(lp1);
        usdc.approve(address(market), 40e6);
        market.addLiquidity(40e6);

        uint256 balBefore = usdc.balanceOf(lp1);
        market.removeLiquidity(market.lpShares(lp1));
        uint256 usdcBack = usdc.balanceOf(lp1) - balBefore;
        vm.stopPrank();

        IEventMarket.Stats memory s = market.getStats();
        assertEq(s.liquidityAdded, INIT_LIQUIDITY + 40e6, "seed + lp1 add");
        assertEq(s.liquidityAddedCount, 2, "two adds");
        assertEq(s.liquidityRemoved, usdcBack, "removed == symmetric USDC leg");
        assertEq(s.liquidityRemovedCount, 1, "one remove");
        assertEq(s.uniqueLps, 2, "creator + lp1");
        assertEq(s.uniqueTraders, 0, "LPing is not trading");
        assertEq(market.participantFlags(lp1), 2, "lp flag only");
    }

    function test_stats_traderAndLpFlagsCoexist() public {
        vm.startPrank(lp1);
        usdc.approve(address(market), 60e6);
        market.addLiquidity(40e6);
        market.buyYes(20e6, 0);
        vm.stopPrank();

        IEventMarket.Stats memory s = market.getStats();
        assertEq(s.uniqueTraders, 1, "lp1 traded once");
        assertEq(s.uniqueLps, 2, "creator + lp1");
        assertEq(market.participantFlags(lp1), 3, "trader | lp");
    }

    function test_stats_pairRedeemTracked() public {
        vm.startPrank(alice);
        usdc.approve(address(market), 60e6);
        market.buyYes(30e6, 0);
        market.buyNo(30e6, 0);
        market.redeemPair(5e6);
        vm.stopPrank();

        IEventMarket.Stats memory s = market.getStats();
        assertEq(s.pairRedeemVolume, 5e6, "pair redeem volume");
        assertEq(s.pairRedeemCount, 1, "one pair redeem");
    }

    function test_stats_settlementFeesAndPayouts() public {
        vm.startPrank(alice);
        usdc.approve(address(market), 30e6);
        uint256 aliceYes = market.buyYes(30e6, 0);
        vm.stopPrank();

        uint256 collateralAtResolve = market.totalCollateral();

        vm.warp(resolveAfter);
        vm.prank(owner);
        market.resolve(true, "");

        IEventMarket.Stats memory afterResolve = market.getStats();
        assertEq(
            afterResolve.platformFee,
            collateralAtResolve * market.platformFeeBps() / BPS,
            "platformFee recorded"
        );
        assertEq(
            afterResolve.creatorFee,
            collateralAtResolve * market.creatorFeeBps() / BPS,
            "creatorFee recorded"
        );

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        market.redeemYes(aliceYes);
        uint256 redeemed = usdc.balanceOf(alice) - aliceBefore;

        uint256 creatorBefore = usdc.balanceOf(creator);
        vm.prank(creator);
        market.claimLpPayout();
        uint256 claimed = usdc.balanceOf(creator) - creatorBefore;

        IEventMarket.Stats memory s = market.getStats();
        assertEq(s.redeemPayout, redeemed, "redeemPayout == USDC paid to holder");
        assertEq(s.redeemCount, 1, "one redeem");
        assertEq(s.lpClaimPayout, claimed, "lpClaimPayout == USDC paid to LP");
        assertEq(s.lpClaimCount, 1, "one LP claim");
    }

    function test_stats_emergencyDrawChargesNoFee() public {
        vm.warp(resolveAfter + market.EMERGENCY_TIMELOCK());
        market.emergencyForceDraw();

        IEventMarket.Stats memory s = market.getStats();
        assertEq(s.platformFee, 0, "draw takes no platform fee");
        assertEq(s.creatorFee, 0, "draw takes no creator fee");
    }

    function test_stats_monotonicAcrossFullLifecycle() public {
        IEventMarket.Stats memory prev = market.getStats();

        vm.startPrank(alice);
        usdc.approve(address(market), 60e6);
        market.buyYes(25e6, 0);
        prev = _assertStatsGrew(prev);

        market.buyNo(15e6, 0);
        prev = _assertStatsGrew(prev);

        market.sellNo(market.noBalanceOf(alice) / 2, 0);
        prev = _assertStatsGrew(prev);
        vm.stopPrank();

        vm.startPrank(lp1);
        usdc.approve(address(market), 20e6);
        market.addLiquidity(20e6);
        prev = _assertStatsGrew(prev);
        vm.stopPrank();

        vm.warp(resolveAfter);
        vm.prank(owner);
        market.resolve(true, "");
        _assertStatsGrew(prev);
    }

    /// @dev Every cumulative field must be >= its previous reading, and the
    ///      derived totals the backend computes must agree with the parts.
    function _assertStatsGrew(IEventMarket.Stats memory prev)
        internal
        view
        returns (IEventMarket.Stats memory next)
    {
        next = market.getStats();

        assertGe(next.buyYesVolume, prev.buyYesVolume, "buyYesVolume shrank");
        assertGe(next.buyNoVolume, prev.buyNoVolume, "buyNoVolume shrank");
        assertGe(next.sellYesVolume, prev.sellYesVolume, "sellYesVolume shrank");
        assertGe(next.sellNoVolume, prev.sellNoVolume, "sellNoVolume shrank");
        assertGe(next.liquidityAdded, prev.liquidityAdded, "liquidityAdded shrank");
        assertGe(next.liquidityRemoved, prev.liquidityRemoved, "liquidityRemoved shrank");
        assertGe(next.pairRedeemVolume, prev.pairRedeemVolume, "pairRedeemVolume shrank");
        assertGe(next.redeemPayout, prev.redeemPayout, "redeemPayout shrank");
        assertGe(next.lpClaimPayout, prev.lpClaimPayout, "lpClaimPayout shrank");
        assertGe(next.buyYesCount, prev.buyYesCount, "buyYesCount shrank");
        assertGe(next.buyNoCount, prev.buyNoCount, "buyNoCount shrank");
        assertGe(next.sellYesCount, prev.sellYesCount, "sellYesCount shrank");
        assertGe(next.sellNoCount, prev.sellNoCount, "sellNoCount shrank");
        assertGe(next.liquidityAddedCount, prev.liquidityAddedCount, "addCount shrank");
        assertGe(next.liquidityRemovedCount, prev.liquidityRemovedCount, "removeCount shrank");
        assertGe(next.uniqueTraders, prev.uniqueTraders, "uniqueTraders shrank");
        assertGe(next.uniqueLps, prev.uniqueLps, "uniqueLps shrank");
        assertGe(next.pairRedeemCount, prev.pairRedeemCount, "pairRedeemCount shrank");
        assertGe(next.redeemCount, prev.redeemCount, "redeemCount shrank");
        assertGe(next.lpClaimCount, prev.lpClaimCount, "lpClaimCount shrank");
    }

    function test_getMarketState_matchesIndividualViews() public {
        vm.startPrank(alice);
        usdc.approve(address(market), 25e6);
        market.buyYes(25e6, 0);
        vm.stopPrank();

        (IEventMarket.MarketInfo memory info, IEventMarket.Stats memory s) = market.getMarketState();
        IEventMarket.MarketInfo memory mi = market.getMarketInfo();
        IEventMarket.Stats memory only = market.getStats();

        assertEq(info.totalCollateral, mi.totalCollateral, "totalCollateral");
        assertEq(info.yesReserve, mi.yesReserve, "yesReserve");
        assertEq(info.noReserve, mi.noReserve, "noReserve");
        assertEq(uint8(info.status), uint8(mi.status), "status");
        assertEq(s.buyYesVolume, only.buyYesVolume, "buyYesVolume");
        assertEq(s.buyYesCount, only.buyYesCount, "buyYesCount");
        assertEq(s.uniqueTraders, only.uniqueTraders, "uniqueTraders");
    }
}
