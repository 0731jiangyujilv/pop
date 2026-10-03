// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EventBet} from "../src/EventBet.sol";
import {EventBetFactory} from "../src/EventBetFactory.sol";
import {IEventBet} from "../src/interfaces/IEventBet.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract EventBetTest is Test {
    EventBetFactory public factory;
    MockERC20 public token;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");
    address public feeCollector = makeAddr("feeCollector");
    address public deployer;

    uint256 public constant MIN_AMOUNT = 10e6; // 10 USDC
    uint256 public constant MAX_AMOUNT = 1000e6; // 1000 USDC
    uint256 public constant FEE_BPS = 100; // 1%

    string public constant QUESTION = "CZ will announce divorce certificate next week?";
    string public constant RESOLUTION_SOURCE = "X posts from @cz_binance";

    function setUp() public {
        vm.warp(10_000);

        deployer = address(this);
        token = new MockERC20("Mock USDC", "USDC", 6);
        factory = new EventBetFactory();
        factory.setSupportedToken(address(token), true);
        factory.setFee(FEE_BPS, feeCollector);

        address[3] memory players = [alice, bob, charlie];
        for (uint256 i = 0; i < players.length; i++) {
            token.mint(players[i], 10_000e6);
            vm.prank(players[i]);
            token.approve(address(factory), type(uint256).max);
        }
    }

    function _createBet(address creator, uint8 side, uint256 amount) internal returns (address) {
        uint256 closingTime = block.timestamp + 7 days;
        vm.prank(creator);
        (, address betAddr) = factory.createEventBet(
            address(token),
            MIN_AMOUNT,
            MAX_AMOUNT,
            closingTime,
            QUESTION,
            RESOLUTION_SOURCE,
            side,
            amount
        );
        return betAddr;
    }

    function _approveAndPlaceBet(address betAddr, address player, uint8 side, uint256 amount) internal {
        vm.startPrank(player);
        token.approve(betAddr, type(uint256).max);
        EventBet(betAddr).placeBet(IEventBet.Side(side), amount);
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                        CREATION TESTS
    //////////////////////////////////////////////////////////////*/

    function test_createEventBet() public {
        address betAddr = _createBet(alice, 0, 100e6); // YES side
        EventBet bet = EventBet(betAddr);

        assertEq(bet.question(), QUESTION);
        assertEq(bet.resolutionSource(), RESOLUTION_SOURCE);
        assertEq(bet.creator(), alice);
        assertEq(uint256(bet.status()), uint256(IEventBet.EventBetStatus.Open));
        assertEq(bet.totalYes(), 100e6);
        assertEq(bet.totalNo(), 0);
        assertEq(bet.totalPlayers(), 1);
        assertEq(bet.closingTime(), block.timestamp + 7 days);
    }

    function test_createEventBet_noSide() public {
        address betAddr = _createBet(alice, 1, 100e6); // NO side
        EventBet bet = EventBet(betAddr);

        assertEq(bet.totalNo(), 100e6);
        assertEq(bet.totalYes(), 0);
    }

    function test_factory_betCount() public {
        _createBet(alice, 0, 100e6);
        _createBet(bob, 1, 50e6);
        assertEq(factory.getEventBetCount(), 2);
    }

    function test_createBet_revertInvalidToken() public {
        MockERC20 badToken = new MockERC20("Bad", "BAD", 6);
        badToken.mint(alice, 1000e6);
        vm.startPrank(alice);
        badToken.approve(address(factory), type(uint256).max);
        vm.expectRevert(abi.encodeWithSignature("InvalidToken()"));
        factory.createEventBet(
            address(badToken), MIN_AMOUNT, MAX_AMOUNT,
            block.timestamp + 7 days, QUESTION, RESOLUTION_SOURCE, 0, 100e6
        );
        vm.stopPrank();
    }

    function test_createBet_revertClosingTimePast() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("InvalidClosingTime()"));
        factory.createEventBet(
            address(token), MIN_AMOUNT, MAX_AMOUNT,
            block.timestamp - 1, QUESTION, RESOLUTION_SOURCE, 0, 100e6
        );
    }

    /*//////////////////////////////////////////////////////////////
                        PLACE BET TESTS
    //////////////////////////////////////////////////////////////*/

    function test_placeBet_opposingSide() public {
        address betAddr = _createBet(alice, 0, 100e6);
        _approveAndPlaceBet(betAddr, bob, 1, 100e6); // NO

        EventBet bet = EventBet(betAddr);
        assertEq(bet.totalYes(), 100e6);
        assertEq(bet.totalNo(), 100e6);
        assertEq(bet.totalPlayers(), 2);
    }

    function test_placeBet_revertSameSideAsInitiator() public {
        address betAddr = _createBet(alice, 0, 100e6);
        vm.startPrank(bob);
        token.approve(betAddr, type(uint256).max);
        vm.expectRevert(IEventBet.SecondBetMustOpposeInitiator.selector);
        EventBet(betAddr).placeBet(IEventBet.Side.Yes, 100e6);
        vm.stopPrank();
    }

    function test_placeBet_revertAmountTooLow() public {
        address betAddr = _createBet(alice, 0, 100e6);
        vm.startPrank(bob);
        token.approve(betAddr, type(uint256).max);
        vm.expectRevert(IEventBet.SecondBetAmountTooLow.selector);
        EventBet(betAddr).placeBet(IEventBet.Side.No, 50e6); // less than initiator
        vm.stopPrank();
    }

    function test_placeBet_revertAfterDeadline() public {
        address betAddr = _createBet(alice, 0, 100e6);
        vm.warp(block.timestamp + 601); // past MAX_ENTRY_WINDOW

        vm.startPrank(bob);
        token.approve(betAddr, type(uint256).max);
        vm.expectRevert(IEventBet.BettingClosed.selector);
        EventBet(betAddr).placeBet(IEventBet.Side.No, 100e6);
        vm.stopPrank();
    }

    function test_placeBet_thirdPlayerAnySide() public {
        address betAddr = _createBet(alice, 0, 100e6);
        _approveAndPlaceBet(betAddr, bob, 1, 100e6);
        _approveAndPlaceBet(betAddr, charlie, 0, 50e6); // YES, same as initiator

        EventBet bet = EventBet(betAddr);
        assertEq(bet.totalYes(), 150e6);
        assertEq(bet.totalNo(), 100e6);
        assertEq(bet.totalPlayers(), 3);
    }

    /*//////////////////////////////////////////////////////////////
                     CLOSE & RESOLVE TESTS
    //////////////////////////////////////////////////////////////*/

    function test_close_and_resolve_yes() public {
        address betAddr = _createBet(alice, 0, 100e6);
        _approveAndPlaceBet(betAddr, bob, 1, 100e6);

        EventBet bet = EventBet(betAddr);

        // Advance past betting deadline
        vm.warp(block.timestamp + 601);
        bet.close();
        assertEq(uint256(bet.status()), uint256(IEventBet.EventBetStatus.Closed));

        // Advance past closing time
        vm.warp(block.timestamp + 7 days);
        bet.resolve(1, "CZ posted about divorce on X"); // YES
        assertEq(uint256(bet.status()), uint256(IEventBet.EventBetStatus.Settled));
        assertEq(uint256(bet.outcome()), uint256(IEventBet.Outcome.Yes));
        assertEq(uint256(bet.winningSide()), uint256(IEventBet.Side.Yes));
        assertFalse(bet.isDraw());
    }

    function test_close_and_resolve_no() public {
        address betAddr = _createBet(alice, 0, 100e6);
        _approveAndPlaceBet(betAddr, bob, 1, 100e6);

        EventBet bet = EventBet(betAddr);
        vm.warp(block.timestamp + 601);
        bet.close();
        vm.warp(block.timestamp + 7 days);
        bet.resolve(2, "No evidence found in CZ's posts"); // NO

        assertEq(uint256(bet.outcome()), uint256(IEventBet.Outcome.No));
        assertEq(uint256(bet.winningSide()), uint256(IEventBet.Side.No));
    }

    function test_resolve_revertBeforeClosingTime() public {
        address betAddr = _createBet(alice, 0, 100e6);
        _approveAndPlaceBet(betAddr, bob, 1, 100e6);

        EventBet bet = EventBet(betAddr);
        vm.warp(block.timestamp + 601);
        bet.close();

        vm.expectRevert(IEventBet.EventNotClosed.selector);
        bet.resolve(1, "too early");
    }

    function test_resolve_revertInvalidOutcome() public {
        address betAddr = _createBet(alice, 0, 100e6);
        _approveAndPlaceBet(betAddr, bob, 1, 100e6);

        EventBet bet = EventBet(betAddr);
        vm.warp(block.timestamp + 601);
        bet.close();
        vm.warp(block.timestamp + 7 days);

        vm.expectRevert(IEventBet.InvalidOutcome.selector);
        bet.resolve(0, "unresolved is not valid");
    }

    function test_resolve_revertNotAdmin() public {
        address betAddr = _createBet(alice, 0, 100e6);
        _approveAndPlaceBet(betAddr, bob, 1, 100e6);

        EventBet bet = EventBet(betAddr);
        vm.warp(block.timestamp + 601);
        bet.close();
        vm.warp(block.timestamp + 7 days);

        vm.prank(alice);
        vm.expectRevert(IEventBet.OnlyAdmin.selector);
        bet.resolve(1, "not admin");
    }

    /*//////////////////////////////////////////////////////////////
                        CLAIM TESTS
    //////////////////////////////////////////////////////////////*/

    function test_claim_winnerGetsPool() public {
        address betAddr = _createBet(alice, 0, 100e6);
        _approveAndPlaceBet(betAddr, bob, 1, 100e6);

        EventBet bet = EventBet(betAddr);
        vm.warp(block.timestamp + 601);
        bet.close();
        vm.warp(block.timestamp + 7 days);
        bet.resolve(1, "YES"); // Alice (YES) wins

        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        bet.claim();
        uint256 aliceAfter = token.balanceOf(alice);

        // Total pool = 200e6, fee = 1% = 2e6, prize pool = 198e6
        assertEq(bet.prizePool(), 198e6);
        assertEq(aliceAfter - aliceBefore, 198e6);
    }

    function test_claim_loserReverts() public {
        address betAddr = _createBet(alice, 0, 100e6);
        _approveAndPlaceBet(betAddr, bob, 1, 100e6);

        EventBet bet = EventBet(betAddr);
        vm.warp(block.timestamp + 601);
        bet.close();
        vm.warp(block.timestamp + 7 days);
        bet.resolve(1, "YES"); // Alice wins, Bob loses

        vm.prank(bob);
        vm.expectRevert(IEventBet.NothingToClaim.selector);
        bet.claim();
    }

    function test_claimFor() public {
        address betAddr = _createBet(alice, 0, 100e6);
        _approveAndPlaceBet(betAddr, bob, 1, 100e6);

        EventBet bet = EventBet(betAddr);
        vm.warp(block.timestamp + 601);
        bet.close();
        vm.warp(block.timestamp + 7 days);
        bet.resolve(1, "YES");

        uint256 aliceBefore = token.balanceOf(alice);
        bet.claimFor(alice); // Anyone can call claimFor
        assertEq(token.balanceOf(alice) - aliceBefore, 198e6);
    }

    function test_claim_feeDistribution() public {
        address betAddr = _createBet(alice, 0, 100e6);
        _approveAndPlaceBet(betAddr, bob, 1, 100e6);

        EventBet bet = EventBet(betAddr);
        vm.warp(block.timestamp + 601);
        bet.close();
        vm.warp(block.timestamp + 7 days);

        uint256 creatorBefore = token.balanceOf(alice);
        uint256 feeBefore = token.balanceOf(feeCollector);

        bet.resolve(1, "YES");

        // Fee = 200e6 * 100 / 10000 = 2e6
        // Creator fee = 2e6 * 30 / 100 = 0.6e6
        // Platform fee = 2e6 - 0.6e6 = 1.4e6
        uint256 totalFee = 2e6;
        uint256 creatorFee = (totalFee * 30) / 100;
        uint256 platformFee = totalFee - creatorFee;

        // Creator gets creator fee on resolution
        assertEq(token.balanceOf(alice) - creatorBefore, creatorFee);
        assertEq(token.balanceOf(feeCollector) - feeBefore, platformFee);
    }

    function test_draw_onlyOneSide() public {
        address betAddr = _createBet(alice, 0, 100e6);
        // No opposing bets

        EventBet bet = EventBet(betAddr);
        vm.warp(block.timestamp + 601);
        bet.close();
        vm.warp(block.timestamp + 7 days);
        bet.resolve(2, "NO");

        assertTrue(bet.isDraw());
        assertEq(bet.prizePool(), 100e6); // Full refund, no fee

        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        bet.claim();
        assertEq(token.balanceOf(alice) - aliceBefore, 100e6);
    }

    /*//////////////////////////////////////////////////////////////
                    EMERGENCY WITHDRAW TESTS
    //////////////////////////////////////////////////////////////*/

    function test_emergencyWithdraw() public {
        address betAddr = _createBet(alice, 0, 100e6);
        _approveAndPlaceBet(betAddr, bob, 1, 100e6);

        EventBet bet = EventBet(betAddr);
        vm.warp(block.timestamp + 601);
        bet.close();

        // Advance past closingTime + EMERGENCY_TIMELOCK
        vm.warp(block.timestamp + 7 days + 1 days + 1);

        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        bet.emergencyWithdraw();
        assertEq(token.balanceOf(alice) - aliceBefore, 100e6);
    }

    function test_emergencyWithdraw_revertTooEarly() public {
        address betAddr = _createBet(alice, 0, 100e6);
        _approveAndPlaceBet(betAddr, bob, 1, 100e6);

        EventBet bet = EventBet(betAddr);
        vm.warp(block.timestamp + 601);
        bet.close();

        vm.prank(alice);
        vm.expectRevert(IEventBet.TimelockNotExpired.selector);
        bet.emergencyWithdraw();
    }

    /*//////////////////////////////////////////////////////////////
                      VIEW FUNCTION TESTS
    //////////////////////////////////////////////////////////////*/

    function test_getEventBetInfo() public {
        address betAddr = _createBet(alice, 0, 100e6);
        EventBet bet = EventBet(betAddr);

        IEventBet.EventBetInfo memory info = bet.getEventBetInfo();
        assertEq(info.creator, alice);
        assertEq(info.token, address(token));
        assertEq(info.minAmount, MIN_AMOUNT);
        assertEq(info.maxAmount, MAX_AMOUNT);
        assertEq(uint256(info.status), uint256(IEventBet.EventBetStatus.Open));
        assertEq(info.totalYes, 100e6);
        assertEq(info.totalNo, 0);
    }

    function test_getPositions() public {
        address betAddr = _createBet(alice, 0, 100e6);
        _approveAndPlaceBet(betAddr, bob, 1, 100e6);

        EventBet bet = EventBet(betAddr);
        IEventBet.Position[] memory yesPos = bet.getYesPositions();
        IEventBet.Position[] memory noPos = bet.getNoPositions();

        assertEq(yesPos.length, 1);
        assertEq(yesPos[0].player, alice);
        assertEq(yesPos[0].amount, 100e6);
        assertEq(noPos.length, 1);
        assertEq(noPos[0].player, bob);
        assertEq(noPos[0].amount, 100e6);
    }

    function test_claimable() public {
        address betAddr = _createBet(alice, 0, 100e6);
        _approveAndPlaceBet(betAddr, bob, 1, 100e6);

        EventBet bet = EventBet(betAddr);
        vm.warp(block.timestamp + 601);
        bet.close();
        vm.warp(block.timestamp + 7 days);
        bet.resolve(1, "YES");

        assertEq(bet.claimable(alice), 198e6);
        assertEq(bet.claimable(bob), 0);
    }
}
