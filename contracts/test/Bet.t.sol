// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {Bet} from "../src/Bet.sol";
import {IBet} from "../src/interfaces/IBet.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockAggregator} from "./mocks/MockAggregator.sol";

contract BetTest is Test {
    Bet public bet;
    MockERC20 public token;
    MockAggregator public priceFeed;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");
    address public dave = makeAddr("dave");
    address public eve = makeAddr("eve");
    address public feeCollector = makeAddr("feeCollector");
    address public admin = makeAddr("admin");

    uint256 public constant MIN_AMOUNT = 10e6; // 10 USDC
    uint256 public constant MAX_AMOUNT = 1000e6; // 1000 USDC
    uint256 public constant BET_DURATION = 600; // 10 minutes observation
    // For BET_DURATION < 6h, lock time bucket = 1 hour
    uint256 public constant BETTING_WINDOW = 1 hours;
    uint256 public constant ADMIN_GRACE = 120; // ADMIN_GRACE_PERIOD
    uint256 public constant FEE_BPS = 250; // 2.5%
    int256 public constant INITIAL_PRICE = 62_000e8; // $62,000

    function setUp() public {
        vm.warp(10_000); // Ensure timestamp > 0 for staleness checks

        token = new MockERC20("Mock USDC", "USDC", 6);
        priceFeed = new MockAggregator(INITIAL_PRICE, 8);

        bet = new Bet(
            address(token),
            MIN_AMOUNT,
            MAX_AMOUNT,
            BET_DURATION,
            address(priceFeed),
            alice, // creator
            FEE_BPS,
            feeCollector,
            admin
        );
        bet.initializeAsset("BTC/USD");

        // Fund players
        address[5] memory players = [alice, bob, charlie, dave, eve];
        for (uint256 i = 0; i < players.length; i++) {
            token.mint(players[i], 10_000e6);
            vm.prank(players[i]);
            token.approve(address(bet), type(uint256).max);
        }
    }

    /*//////////////////////////////////////////////////////////////
                        CONSTRUCTOR TESTS
    //////////////////////////////////////////////////////////////*/

    function test_constructor() public view {
        assertEq(bet.creator(), alice);
        assertEq(address(bet.token()), address(token));
        assertEq(bet.asset(), "BTC/USD");
        assertEq(bet.minAmount(), MIN_AMOUNT);
        assertEq(bet.maxAmount(), MAX_AMOUNT);
        assertEq(bet.duration(), BET_DURATION);
        assertEq(bet.bettingDeadline(), block.timestamp + BETTING_WINDOW);
        assertEq(address(bet.priceFeed()), address(priceFeed));
        assertEq(uint256(bet.status()), uint256(IBet.BetStatus.Open));
        assertEq(bet.feeBps(), FEE_BPS);
        assertEq(bet.feeRecipient(), feeCollector);
        assertEq(bet.admin(), admin);
    }

    function test_constructor_revertFeeTooHigh() public {
        vm.expectRevert(IBet.InvalidFee.selector);
        new Bet(address(token), MIN_AMOUNT, MAX_AMOUNT, BET_DURATION, address(priceFeed), alice, 1001, feeCollector, admin);
    }

    function test_constructor_bettingDeadlineBuckets() public {
        // < 6h → 1h
        Bet shortBet = new Bet(
            address(token), MIN_AMOUNT, MAX_AMOUNT, 1 hours, address(priceFeed), alice, FEE_BPS, feeCollector, admin
        );
        shortBet.initializeAsset("BTC/USD");
        assertEq(shortBet.bettingDeadline(), block.timestamp + 1 hours);

        // 6h ≤ duration < 24h → 2h
        Bet midBet = new Bet(
            address(token), MIN_AMOUNT, MAX_AMOUNT, 12 hours, address(priceFeed), alice, FEE_BPS, feeCollector, admin
        );
        midBet.initializeAsset("BTC/USD");
        assertEq(midBet.bettingDeadline(), block.timestamp + 2 hours);

        // ≥ 24h → 6h
        Bet longBet = new Bet(
            address(token), MIN_AMOUNT, MAX_AMOUNT, 2 days, address(priceFeed), alice, FEE_BPS, feeCollector, admin
        );
        longBet.initializeAsset("BTC/USD");
        assertEq(longBet.bettingDeadline(), block.timestamp + 6 hours);
    }

    /*//////////////////////////////////////////////////////////////
                        PLACE BET TESTS
    //////////////////////////////////////////////////////////////*/

    function test_placeBet_up() public {
        vm.prank(alice);
        bet.placeBet(IBet.Side.Up, 100e6);

        assertTrue(bet.hasPlaced(alice));
        assertEq(uint256(bet.playerSide(alice)), uint256(IBet.Side.Up));
        assertEq(bet.playerAmount(alice), 100e6);
        assertEq(bet.totalUp(), 100e6);
        assertEq(bet.totalDown(), 0);
        assertEq(token.balanceOf(address(bet)), 100e6);
    }

    function test_placeBet_down() public {
        vm.prank(bob);
        bet.placeBet(IBet.Side.Down, 200e6);

        assertTrue(bet.hasPlaced(bob));
        assertEq(uint256(bet.playerSide(bob)), uint256(IBet.Side.Down));
        assertEq(bet.playerAmount(bob), 200e6);
        assertEq(bet.totalDown(), 200e6);
    }

    function test_placeBet_multiplePlayers() public {
        vm.prank(alice);
        bet.placeBet(IBet.Side.Up, 50e6);
        vm.prank(bob);
        bet.placeBet(IBet.Side.Down, 50e6);
        vm.prank(charlie);
        bet.placeBet(IBet.Side.Up, 200e6);
        vm.prank(eve);
        bet.placeBet(IBet.Side.Down, 100e6);

        assertEq(bet.totalUp(), 250e6);
        assertEq(bet.totalDown(), 150e6);
        assertEq(token.balanceOf(address(bet)), 400e6);

        IBet.Position[] memory ups = bet.getUpPositions();
        assertEq(ups.length, 2);
        assertEq(ups[0].player, alice);
        assertEq(ups[0].amount, 50e6);
        assertEq(ups[1].player, charlie);
        assertEq(ups[1].amount, 200e6);

        IBet.Position[] memory downs = bet.getDownPositions();
        assertEq(downs.length, 2);
    }

    function test_placeBet_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit IBet.BetPlaced(alice, IBet.Side.Up, 100e6);

        vm.prank(alice);
        bet.placeBet(IBet.Side.Up, 100e6);
    }

    function test_placeBet_revertAfterDeadline() public {
        vm.warp(bet.bettingDeadline());

        vm.expectRevert(IBet.BettingClosed.selector);
        vm.prank(alice);
        bet.placeBet(IBet.Side.Up, 100e6);
    }

    function test_placeBet_revertAlreadyPlaced() public {
        vm.prank(alice);
        bet.placeBet(IBet.Side.Up, 100e6);

        vm.expectRevert(IBet.AlreadyPlaced.selector);
        vm.prank(alice);
        bet.placeBet(IBet.Side.Down, 50e6);
    }

    function test_placeBet_revertAmountTooLow() public {
        vm.expectRevert(IBet.AmountTooLow.selector);
        vm.prank(alice);
        bet.placeBet(IBet.Side.Up, MIN_AMOUNT - 1);
    }

    function test_placeBet_revertAmountTooHigh() public {
        vm.expectRevert(IBet.AmountTooHigh.selector);
        vm.prank(alice);
        bet.placeBet(IBet.Side.Up, MAX_AMOUNT + 1);
    }

    function test_placeBet_unlimitedMax() public {
        Bet unlimitedBet = new Bet(
            address(token), MIN_AMOUNT, 0, BET_DURATION, address(priceFeed), alice, 0, address(0), admin
        );
        unlimitedBet.initializeAsset("BTC/USD");
        vm.prank(alice);
        token.approve(address(unlimitedBet), type(uint256).max);

        // maxAmount=0 means unlimited
        vm.prank(alice);
        unlimitedBet.placeBet(IBet.Side.Up, 5000e6);
        assertEq(unlimitedBet.playerAmount(alice), 5000e6);
    }

    function test_placeBet_revertWrongStatus() public {
        // Lock the bet first
        _placeBothSides();
        _lockBet();

        vm.expectRevert(IBet.InvalidStatus.selector);
        vm.prank(dave);
        bet.placeBet(IBet.Side.Up, 100e6);
    }

    function test_placeBet_adminGetsGracePeriod() public {
        _placeBothSides();

        // Just past bettingDeadline: regular users are locked out...
        vm.warp(bet.bettingDeadline());
        vm.expectRevert(IBet.BettingClosed.selector);
        vm.prank(dave);
        bet.placeBet(IBet.Side.Up, 100e6);

        // ...but admin can still place within the grace window.
        vm.warp(bet.bettingDeadline() + ADMIN_GRACE - 1);
        token.mint(admin, 100e6);
        vm.prank(admin);
        token.approve(address(bet), type(uint256).max);
        vm.prank(admin);
        bet.placeBet(IBet.Side.Down, 100e6);
        assertTrue(bet.hasPlaced(admin));

        // At the end of the grace window the admin is also locked out.
        vm.warp(bet.bettingDeadline() + ADMIN_GRACE);
        vm.expectRevert(IBet.BettingClosed.selector);
        vm.prank(admin);
        bet.placeBet(IBet.Side.Up, 100e6);
    }

    function test_lock_revertNotAdmin() public {
        _placeBothSides();
        vm.warp(bet.bettingDeadline() + ADMIN_GRACE);

        vm.expectRevert(IBet.OnlyAdmin.selector);
        vm.prank(alice);
        bet.lock();
    }

    function test_settle_revertNotAdmin() public {
        _placeBothSides();
        _lockBet();

        vm.warp(bet.endTime());
        priceFeed.setPrice(INITIAL_PRICE + 100e8);

        vm.expectRevert(IBet.OnlyAdmin.selector);
        vm.prank(alice);
        bet.settle();
    }

    /*//////////////////////////////////////////////////////////////
                            LOCK TESTS
    //////////////////////////////////////////////////////////////*/

    function test_lock() public {
        _placeBothSides();
        vm.warp(bet.bettingDeadline() + ADMIN_GRACE);
        priceFeed.setPrice(INITIAL_PRICE);

        vm.prank(admin);
        bet.lock();

        assertEq(uint256(bet.status()), uint256(IBet.BetStatus.Locked));
        assertEq(bet.startPrice(), INITIAL_PRICE);
        assertGt(bet.startTime(), 0);
        assertEq(bet.endTime(), bet.startTime() + BET_DURATION);
    }

    function test_lock_emitsEvent() public {
        _placeBothSides();
        vm.warp(bet.bettingDeadline() + ADMIN_GRACE);
        priceFeed.setPrice(INITIAL_PRICE);

        vm.expectEmit(false, false, false, true);
        emit IBet.BetLocked(INITIAL_PRICE, block.timestamp, block.timestamp + BET_DURATION);

        vm.prank(admin);
        bet.lock();
    }

    function test_lock_revertBeforeDeadline() public {
        _placeBothSides();

        vm.expectRevert(IBet.BettingNotClosed.selector);
        vm.prank(admin);
        bet.lock();
    }

    function test_lock_revertDuringGracePeriod() public {
        _placeBothSides();
        vm.warp(bet.bettingDeadline() + ADMIN_GRACE - 1);

        vm.expectRevert(IBet.BettingNotClosed.selector);
        vm.prank(admin);
        bet.lock();
    }

    function test_lock_revertSingleSided() public {
        vm.prank(alice);
        bet.placeBet(IBet.Side.Up, 100e6);

        vm.warp(bet.bettingDeadline() + ADMIN_GRACE);
        vm.expectRevert(IBet.LockRequiresBothSides.selector);
        vm.prank(admin);
        bet.lock();
    }

    function test_lock_revertStalePrice() public {
        _placeBothSides();
        vm.warp(bet.bettingDeadline() + ADMIN_GRACE);

        priceFeed.setPriceWithTimestamp(INITIAL_PRICE, block.timestamp - bet.MAX_ORACLE_STALENESS() - 1);

        vm.expectRevert(IBet.OracleStalePrice.selector);
        vm.prank(admin);
        bet.lock();
    }

    /*//////////////////////////////////////////////////////////////
                            EXPIRE TESTS
    //////////////////////////////////////////////////////////////*/

    function test_expire_singleSidedRefundsAllPlayers() public {
        vm.prank(alice);
        bet.placeBet(IBet.Side.Up, 100e6);

        uint256 aliceBefore = token.balanceOf(alice);

        vm.warp(bet.bettingDeadline() + ADMIN_GRACE);
        vm.expectEmit(false, false, false, true);
        emit IBet.BetExpired(100e6);
        vm.prank(admin);
        bet.expire();

        assertEq(uint256(bet.status()), uint256(IBet.BetStatus.Expired));
        assertEq(token.balanceOf(alice), aliceBefore + 100e6);
        assertTrue(bet.claimed(alice));
    }

    function test_expire_revertBeforeGraceElapsed() public {
        vm.prank(alice);
        bet.placeBet(IBet.Side.Up, 100e6);

        vm.warp(bet.bettingDeadline() + ADMIN_GRACE - 1);
        vm.expectRevert(IBet.BettingNotClosed.selector);
        vm.prank(admin);
        bet.expire();
    }

    function test_expire_revertIfContested() public {
        _placeBothSides();
        vm.warp(bet.bettingDeadline() + ADMIN_GRACE);

        vm.expectRevert(IBet.BetContested.selector);
        vm.prank(admin);
        bet.expire();
    }

    function test_expire_revertNotAdmin() public {
        vm.prank(alice);
        bet.placeBet(IBet.Side.Up, 100e6);

        vm.warp(bet.bettingDeadline() + ADMIN_GRACE);
        vm.expectRevert(IBet.OnlyAdmin.selector);
        vm.prank(alice);
        bet.expire();
    }

    function test_expire_revertWrongStatus() public {
        _placeBothSides();
        _lockBet();

        vm.expectRevert(IBet.InvalidStatus.selector);
        vm.prank(admin);
        bet.expire();
    }

    /*//////////////////////////////////////////////////////////////
                         SETTLEMENT TESTS
    //////////////////////////////////////////////////////////////*/

    function test_settle_upWins() public {
        _placeBothSides();
        _lockBet();

        int256 newPrice = INITIAL_PRICE + 1000e8;
        vm.warp(bet.endTime());
        priceFeed.setPrice(newPrice);

        vm.prank(admin);
        bet.settle();

        assertEq(uint256(bet.status()), uint256(IBet.BetStatus.Settled));
        assertEq(uint256(bet.winningSide()), uint256(IBet.Side.Up));
        assertFalse(bet.isDraw());
        assertEq(bet.endPrice(), newPrice);
    }

    function test_settle_downWins() public {
        _placeBothSides();
        _lockBet();

        int256 newPrice = INITIAL_PRICE - 1000e8;
        vm.warp(bet.endTime());
        priceFeed.setPrice(newPrice);

        vm.prank(admin);
        bet.settle();

        assertEq(uint256(bet.winningSide()), uint256(IBet.Side.Down));
        assertFalse(bet.isDraw());
    }

    function test_settle_draw() public {
        _placeBothSides();
        _lockBet();

        vm.warp(bet.endTime());
        priceFeed.setPrice(INITIAL_PRICE);

        vm.prank(admin);
        bet.settle();

        assertTrue(bet.isDraw());
        // No fee collected on draw
        assertEq(token.balanceOf(feeCollector), 0);
    }

    function test_expire_singleSidedRefundsWithoutLock() public {
        // Single-sided bets now take the expire() path — no lock/settle needed.
        vm.prank(alice);
        bet.placeBet(IBet.Side.Up, 100e6);

        vm.warp(bet.bettingDeadline() + ADMIN_GRACE);
        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(admin);
        bet.expire();

        assertEq(uint256(bet.status()), uint256(IBet.BetStatus.Expired));
        assertEq(token.balanceOf(feeCollector), 0);
        assertEq(token.balanceOf(alice), aliceBefore + 100e6);
    }

    function test_settle_collectsFee() public {
        // Use charlie and dave (not alice who is creator) to avoid confusion
        vm.prank(charlie);
        bet.placeBet(IBet.Side.Up, 100e6);
        vm.prank(dave);
        bet.placeBet(IBet.Side.Down, 100e6);
        
        _lockBet();

        uint256 aliceBalanceBefore = token.balanceOf(alice);
        uint256 feeCollectorBalanceBefore = token.balanceOf(feeCollector);

        vm.warp(bet.endTime());
        priceFeed.setPrice(INITIAL_PRICE + 100e8);

        vm.prank(admin);
        bet.settle();

        uint256 totalPool = bet.totalUp() + bet.totalDown();
        uint256 totalFee = (totalPool * FEE_BPS) / 10_000;
        uint256 expectedCreatorFee = (totalFee * 30) / 100;
        uint256 expectedPlatformFee = totalFee - expectedCreatorFee;
        
        // Creator (alice) gets 30% of fees (she didn't bet, so only fees)
        assertEq(token.balanceOf(alice) - aliceBalanceBefore, expectedCreatorFee);
        // Platform (feeCollector) gets 70% of fees
        assertEq(token.balanceOf(feeCollector) - feeCollectorBalanceBefore, expectedPlatformFee);
    }

    function test_settle_emitsEvents() public {
        _placeBothSides();
        _lockBet();

        int256 newPrice = INITIAL_PRICE + 100e8;
        vm.warp(bet.endTime());
        priceFeed.setPrice(newPrice);

        uint256 totalPool = bet.totalUp() + bet.totalDown();
        uint256 expectedFee = (totalPool * FEE_BPS) / 10_000;

        vm.expectEmit(true, false, false, true);
        emit IBet.FeesCollected(feeCollector, expectedFee);

        vm.expectEmit(false, false, false, true);
        emit IBet.BetSettled(IBet.Side.Up, false, newPrice);

        vm.prank(admin);
        bet.settle();
    }

    function test_settle_revertBeforeExpiry() public {
        _placeBothSides();
        _lockBet();

        vm.expectRevert(IBet.BetNotExpired.selector);
        vm.prank(admin);
        bet.settle();
    }

    function test_settle_revertWrongStatus() public {
        vm.expectRevert(IBet.InvalidStatus.selector);
        vm.prank(admin);
        bet.settle();
    }

    function test_settle_cannotSettleTwice() public {
        _placeBothSides();
        _lockBet();

        vm.warp(bet.endTime());
        priceFeed.setPrice(INITIAL_PRICE + 100e8);
        vm.prank(admin);
        bet.settle();

        vm.expectRevert(IBet.InvalidStatus.selector);
        vm.prank(admin);
        bet.settle();
    }

    /*//////////////////////////////////////////////////////////////
                          CLAIM TESTS
    //////////////////////////////////////////////////////////////*/

    function test_claim_winnerGetsProportionalPayout() public {
        // Alice 50 UP, Bob 50 DOWN, Charlie 200 UP, Eve 100 DOWN
        vm.prank(alice);
        bet.placeBet(IBet.Side.Up, 50e6);
        vm.prank(bob);
        bet.placeBet(IBet.Side.Down, 50e6);
        vm.prank(charlie);
        bet.placeBet(IBet.Side.Up, 200e6);
        vm.prank(eve);
        bet.placeBet(IBet.Side.Down, 100e6);

        _lockBet();

        vm.warp(bet.endTime());
        priceFeed.setPrice(INITIAL_PRICE + 100e8); // UP wins

        vm.prank(admin);
        bet.settle();

        uint256 totalPool = 400e6; // 250 + 150
        uint256 fee = (totalPool * FEE_BPS) / 10_000;
        uint256 winPool = totalPool - fee;

        // Alice: winPool * 50 / 250
        uint256 alicePayout = (winPool * 50e6) / 250e6;
        // Charlie: winPool * 200 / 250
        uint256 charliePayout = (winPool * 200e6) / 250e6;

        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        bet.claim();
        assertEq(token.balanceOf(alice), aliceBefore + alicePayout);

        uint256 charlieBefore = token.balanceOf(charlie);
        vm.prank(charlie);
        bet.claim();
        assertEq(token.balanceOf(charlie), charlieBefore + charliePayout);
    }

    function test_claim_drawRefundsAll() public {
        _placeBothSides();
        _lockBet();

        vm.warp(bet.endTime());
        priceFeed.setPrice(INITIAL_PRICE); // draw

        vm.prank(admin);
        bet.settle();

        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        bet.claim();
        assertEq(token.balanceOf(alice), aliceBefore + 100e6);

        uint256 bobBefore = token.balanceOf(bob);
        vm.prank(bob);
        bet.claim();
        assertEq(token.balanceOf(bob), bobBefore + 100e6);
    }

    function test_claim_emitsEvent() public {
        _placeBothSides();
        _lockBet();
        vm.warp(bet.endTime());
        priceFeed.setPrice(INITIAL_PRICE + 100e8);
        vm.prank(admin);
        bet.settle();

        uint256 totalPool = 200e6;
        uint256 fee = (totalPool * FEE_BPS) / 10_000;
        uint256 winPool = totalPool - fee;
        uint256 payout = (winPool * 100e6) / 100e6; // alice is only UP player

        vm.expectEmit(true, false, false, true);
        emit IBet.Claimed(alice, payout);

        vm.prank(alice);
        bet.claim();
    }

    function test_claim_revertNotAPlayer() public {
        _placeBothSides();
        _lockBet();
        vm.warp(bet.endTime());
        priceFeed.setPrice(INITIAL_PRICE + 100e8);
        vm.prank(admin);
        bet.settle();

        vm.expectRevert(IBet.NotAPlayer.selector);
        vm.prank(dave); // dave didn't bet
        bet.claim();
    }

    function test_claim_revertAlreadyClaimed() public {
        _placeBothSides();
        _lockBet();
        vm.warp(bet.endTime());
        priceFeed.setPrice(INITIAL_PRICE + 100e8);
        vm.prank(admin);
        bet.settle();

        vm.prank(alice);
        bet.claim();

        vm.expectRevert(IBet.AlreadyClaimed.selector);
        vm.prank(alice);
        bet.claim();
    }

    function test_claim_revertLoserCantClaim() public {
        _placeBothSides();
        _lockBet();
        vm.warp(bet.endTime());
        priceFeed.setPrice(INITIAL_PRICE + 100e8); // UP wins
        vm.prank(admin);
        bet.settle();

        vm.expectRevert(IBet.NothingToClaim.selector);
        vm.prank(bob); // bob bet DOWN
        bet.claim();
    }

    function test_claim_revertNotSettled() public {
        _placeBothSides();

        vm.expectRevert(IBet.InvalidStatus.selector);
        vm.prank(alice);
        bet.claim();
    }

    function test_claimFor_transfersToPlayer() public {
        _placeBothSides();
        _lockBet();
        vm.warp(bet.endTime());
        priceFeed.setPrice(INITIAL_PRICE + 100e8);
        vm.prank(admin);
        bet.settle();

        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(dave);
        bet.claimFor(alice);

        assertEq(token.balanceOf(alice), aliceBefore + 195e6);
        assertTrue(bet.claimed(alice));
    }

    function test_claimFor_revertLoserCantClaim() public {
        _placeBothSides();
        _lockBet();
        vm.warp(bet.endTime());
        priceFeed.setPrice(INITIAL_PRICE + 100e8);
        vm.prank(admin);
        bet.settle();

        vm.expectRevert(IBet.NothingToClaim.selector);
        vm.prank(dave);
        bet.claimFor(bob);
    }

    function test_claimFor_revertAlreadyClaimed() public {
        _placeBothSides();
        _lockBet();
        vm.warp(bet.endTime());
        priceFeed.setPrice(INITIAL_PRICE + 100e8);
        vm.prank(admin);
        bet.settle();

        vm.prank(dave);
        bet.claimFor(alice);

        vm.expectRevert(IBet.AlreadyClaimed.selector);
        vm.prank(eve);
        bet.claimFor(alice);
    }

    function test_claim_precision_noResidue() public {
        // Test that sum(payouts) + fee == totalPool (no tokens stuck in contract)
        vm.prank(alice);
        bet.placeBet(IBet.Side.Up, 50e6);
        vm.prank(bob);
        bet.placeBet(IBet.Side.Down, 50e6);
        vm.prank(charlie);
        bet.placeBet(IBet.Side.Up, 200e6);
        vm.prank(dave);
        bet.placeBet(IBet.Side.Up, 100e6);
        vm.prank(eve);
        bet.placeBet(IBet.Side.Down, 100e6);

        _lockBet();
        vm.warp(bet.endTime());
        priceFeed.setPrice(INITIAL_PRICE + 100e8); // UP wins
        vm.prank(admin);
        bet.settle();

        vm.prank(alice);
        bet.claim();
        vm.prank(charlie);
        bet.claim();
        vm.prank(dave);
        bet.claim();

        // Due to integer division, there may be a tiny residue (< number of winners)
        uint256 remaining = token.balanceOf(address(bet));
        assertLt(remaining, 3); // at most 2 wei residue for 3 winners
    }

    /*//////////////////////////////////////////////////////////////
                     EMERGENCY WITHDRAW TESTS
    //////////////////////////////////////////////////////////////*/

    function test_emergencyWithdraw() public {
        _placeBothSides();
        _lockBet();

        vm.warp(bet.endTime() + bet.EMERGENCY_TIMELOCK() + 1);

        vm.prank(alice);
        bet.emergencyWithdraw();

        assertTrue(bet.claimed(alice));
        assertEq(token.balanceOf(alice), 10_000e6); // refunded full amount
    }

    function test_emergencyWithdraw_emitsEvent() public {
        _placeBothSides();
        _lockBet();

        vm.warp(bet.endTime() + bet.EMERGENCY_TIMELOCK() + 1);

        vm.expectEmit(true, false, false, true);
        emit IBet.EmergencyWithdraw(alice, 100e6);

        vm.prank(alice);
        bet.emergencyWithdraw();
    }

    function test_emergencyWithdraw_revertBeforeTimelock() public {
        _placeBothSides();
        _lockBet();

        vm.warp(bet.endTime() + bet.EMERGENCY_TIMELOCK() - 1);

        vm.expectRevert(IBet.TimelockNotExpired.selector);
        vm.prank(alice);
        bet.emergencyWithdraw();
    }

    function test_emergencyWithdraw_revertNotAPlayer() public {
        _placeBothSides();
        _lockBet();

        vm.warp(bet.endTime() + bet.EMERGENCY_TIMELOCK() + 1);

        vm.expectRevert(IBet.NotAPlayer.selector);
        vm.prank(dave);
        bet.emergencyWithdraw();
    }

    function test_emergencyWithdraw_revertDoubleClaim() public {
        _placeBothSides();
        _lockBet();

        vm.warp(bet.endTime() + bet.EMERGENCY_TIMELOCK() + 1);

        vm.prank(alice);
        bet.emergencyWithdraw();

        vm.expectRevert(IBet.AlreadyClaimed.selector);
        vm.prank(alice);
        bet.emergencyWithdraw();
    }

    function test_emergencyWithdraw_revertWrongStatus() public {
        vm.expectRevert(IBet.InvalidStatus.selector);
        vm.prank(alice);
        bet.emergencyWithdraw();
    }

    /*//////////////////////////////////////////////////////////////
                         GET BET INFO TEST
    //////////////////////////////////////////////////////////////*/

    function test_getBetInfo() public {
        _placeBothSides();
        _lockBet();

        IBet.BetInfo memory info = bet.getBetInfo();

        assertEq(info.creator, alice);
        assertEq(info.token, address(token));
        assertEq(info.minAmount, MIN_AMOUNT);
        assertEq(info.maxAmount, MAX_AMOUNT);
        assertEq(info.duration, BET_DURATION);
        assertEq(info.priceFeed, address(priceFeed));
        assertEq(info.startPrice, INITIAL_PRICE);
        assertEq(uint256(info.status), uint256(IBet.BetStatus.Locked));
        assertEq(info.totalUp, 100e6);
        assertEq(info.totalDown, 100e6);
        assertEq(info.feeBps, FEE_BPS);
        assertEq(info.feeRecipient, feeCollector);
    }

    /*//////////////////////////////////////////////////////////////
                      NO FEE SCENARIO TEST
    //////////////////////////////////////////////////////////////*/

    function test_settle_noFeeWhenZeroBps() public {
        Bet noFeeBet = new Bet(
            address(token), MIN_AMOUNT, MAX_AMOUNT, BET_DURATION, address(priceFeed), alice, 0, address(0), admin
        );
        noFeeBet.initializeAsset("BTC/USD");
        vm.prank(alice);
        token.approve(address(noFeeBet), type(uint256).max);
        vm.prank(bob);
        token.approve(address(noFeeBet), type(uint256).max);

        vm.prank(alice);
        noFeeBet.placeBet(IBet.Side.Up, 100e6);
        vm.prank(bob);
        noFeeBet.placeBet(IBet.Side.Down, 100e6);

        vm.warp(noFeeBet.bettingDeadline() + ADMIN_GRACE);
        priceFeed.setPrice(INITIAL_PRICE);
        vm.prank(admin);
        noFeeBet.lock();
        vm.warp(noFeeBet.endTime());
        priceFeed.setPrice(INITIAL_PRICE + 100e8);
        vm.prank(admin);
        noFeeBet.settle();

        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        noFeeBet.claim();
        // Winner gets full pool (200 USDC) with no fee
        assertEq(token.balanceOf(alice), aliceBefore + 200e6);
    }

    /*//////////////////////////////////////////////////////////////
                           FUZZ TESTS
    //////////////////////////////////////////////////////////////*/

    function testFuzz_settle_priceUp(int256 priceIncrease) public {
        vm.assume(priceIncrease > 0 && priceIncrease < type(int256).max - INITIAL_PRICE);

        _placeBothSides();
        _lockBet();

        int256 newPrice = INITIAL_PRICE + priceIncrease;
        vm.warp(bet.endTime());
        priceFeed.setPrice(newPrice);

        vm.prank(admin);
        bet.settle();

        assertEq(uint256(bet.winningSide()), uint256(IBet.Side.Up));
        assertFalse(bet.isDraw());
    }

    function testFuzz_settle_priceDown(int256 priceDecrease) public {
        vm.assume(priceDecrease > 0 && priceDecrease < INITIAL_PRICE);

        _placeBothSides();
        _lockBet();

        int256 newPrice = INITIAL_PRICE - priceDecrease;
        vm.assume(newPrice > 0);
        vm.warp(bet.endTime());
        priceFeed.setPrice(newPrice);

        vm.prank(admin);
        bet.settle();

        assertEq(uint256(bet.winningSide()), uint256(IBet.Side.Down));
        assertFalse(bet.isDraw());
    }

    /*//////////////////////////////////////////////////////////////
                           HELPERS
    //////////////////////////////////////////////////////////////*/

    function _placeBothSides() internal {
        vm.prank(alice);
        bet.placeBet(IBet.Side.Up, 100e6);
        vm.prank(bob);
        bet.placeBet(IBet.Side.Down, 100e6);
    }

    function _lockBet() internal {
        vm.warp(bet.bettingDeadline() + ADMIN_GRACE);
        priceFeed.setPrice(INITIAL_PRICE); // refresh price
        vm.prank(admin);
        bet.lock();
    }
}
