// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {BetFactory} from "../src/BetFactory.sol";
import {Bet} from "../src/Bet.sol";
import {PriceOracleFactory} from "../src/PriceOracleFactory.sol";
import {IBetFactory} from "../src/interfaces/IBetFactory.sol";
import {IBet} from "../src/interfaces/IBet.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockAggregator} from "./mocks/MockAggregator.sol";

contract BetFactoryTest is Test {
    BetFactory public factory;
    PriceOracleFactory public oracleFactory;
    MockERC20 public token;
    MockAggregator public priceFeed;

    address public owner = makeAddr("owner");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");
    address public feeCollector = makeAddr("feeCollector");

    uint256 public constant MIN_AMOUNT = 10e6;
    uint256 public constant MAX_AMOUNT = 1000e6;
    uint256 public constant BET_DURATION = 600; // 10 minutes observation
    uint256 public constant BETTING_WINDOW = 1 hours; // duration < 6h bucket
    uint256 public constant ADMIN_GRACE = 120;
    int256 public constant INITIAL_PRICE = 62_000e8;

    function setUp() public {
        vm.warp(10_000);

        vm.startPrank(owner);
        oracleFactory = new PriceOracleFactory(owner);
        token = new MockERC20("Mock USDC", "USDC", 6);
        priceFeed = new MockAggregator(INITIAL_PRICE, 8);
        oracleFactory.addOracle("BTC/USD", address(priceFeed));

        factory = new BetFactory(address(oracleFactory));
        factory.setSupportedToken(address(token), true);
        factory.setFee(250, feeCollector);
        vm.stopPrank();

        address[3] memory users = [alice, bob, charlie];
        for (uint256 i = 0; i < users.length; i++) {
            token.mint(users[i], 10_000e6);
            vm.prank(users[i]);
            token.approve(address(factory), type(uint256).max);
        }
    }

    /*//////////////////////////////////////////////////////////////
                        CONSTRUCTOR TESTS
    //////////////////////////////////////////////////////////////*/

    function test_constructor() public view {
        assertEq(factory.owner(), owner);
        assertEq(factory.nextBetId(), 0);
        assertEq(factory.minDuration(), 300);
        assertEq(factory.maxDuration(), 604800);
        assertEq(factory.minBettingWindow(), 60);
        assertEq(factory.maxBettingWindow(), 86400000);
    }

    /*//////////////////////////////////////////////////////////////
                        CREATE BET TESTS
    //////////////////////////////////////////////////////////////*/

    function test_createBet() public {
        vm.prank(alice);
        (uint256 betId, address betContract) =
            factory.createBet(address(token), MIN_AMOUNT, MAX_AMOUNT, BET_DURATION, "BTC/USD", uint8(IBet.Side.Up), 100e6);

        assertEq(betId, 0);
        assertTrue(betContract != address(0));
        assertEq(factory.getBet(0), betContract);
        assertEq(factory.nextBetId(), 1);
        assertEq(factory.getBetCount(), 1);

        // Verify the deployed Bet contract
        Bet bet = Bet(betContract);
        assertEq(bet.creator(), alice);
        assertEq(address(bet.token()), address(token));
        assertEq(bet.minAmount(), MIN_AMOUNT);
        assertEq(bet.maxAmount(), MAX_AMOUNT);
        assertEq(bet.duration(), BET_DURATION);
        assertEq(bet.bettingDeadline(), block.timestamp + BETTING_WINDOW);
        assertEq(address(bet.priceFeed()), address(priceFeed));
        assertEq(bet.feeBps(), 250);
        assertEq(bet.feeRecipient(), feeCollector);
        assertEq(bet.admin(), owner);
        assertTrue(bet.hasPlaced(alice));
        assertEq(uint256(bet.playerSide(alice)), uint256(IBet.Side.Up));
        assertEq(bet.playerAmount(alice), 100e6);
        assertEq(bet.totalPlayers(), 1);
        assertEq(token.balanceOf(betContract), 100e6);
    }

    function test_createBet_anyoneCanCreate() public {
        // Alice (not owner, not operator) can create
        vm.prank(alice);
        (uint256 id1,) =
            factory.createBet(address(token), MIN_AMOUNT, MAX_AMOUNT, BET_DURATION, "BTC/USD", uint8(IBet.Side.Up), 100e6);

        // Bob too
        vm.prank(bob);
        (uint256 id2,) =
            factory.createBet(address(token), MIN_AMOUNT, MAX_AMOUNT, BET_DURATION, "BTC/USD", uint8(IBet.Side.Down), 100e6);

        assertEq(id1, 0);
        assertEq(id2, 1);
        assertEq(factory.getBetCount(), 2);
    }

    function test_createBet_unlimitedMax() public {
        vm.prank(alice);
        (, address betContract) =
            factory.createBet(address(token), MIN_AMOUNT, 0, BET_DURATION, "BTC/USD", uint8(IBet.Side.Up), 5000e6);

        Bet bet = Bet(betContract);
        assertEq(bet.maxAmount(), 0);
    }

    function test_createBet_emitsEvent() public {
        vm.prank(alice);

        vm.expectEmit(true, true, false, false);
        emit IBetFactory.BetCreated(0, address(0), alice, address(token), "BTC/USD");

        factory.createBet(address(token), MIN_AMOUNT, MAX_AMOUNT, BET_DURATION, "BTC/USD", uint8(IBet.Side.Up), 100e6);
    }

    function test_createBet_revertZeroMinAmount() public {
        vm.expectRevert(IBetFactory.InvalidAmount.selector);
        vm.prank(alice);
        factory.createBet(address(token), 0, MAX_AMOUNT, BET_DURATION, "BTC/USD", uint8(IBet.Side.Up), 100e6);
    }

    function test_createBet_revertMaxLessThanMin() public {
        vm.expectRevert(IBetFactory.InvalidAmount.selector);
        vm.prank(alice);
        factory.createBet(address(token), 100e6, 50e6, BET_DURATION, "BTC/USD", uint8(IBet.Side.Up), 100e6);
    }

    function test_createBet_revertDurationTooShort() public {
        vm.expectRevert(IBetFactory.InvalidDuration.selector);
        vm.prank(alice);
        factory.createBet(address(token), MIN_AMOUNT, MAX_AMOUNT, 60, "BTC/USD", uint8(IBet.Side.Up), 100e6);
    }

    function test_createBet_revertDurationTooLong() public {
        vm.expectRevert(IBetFactory.InvalidDuration.selector);
        vm.prank(alice);
        factory.createBet(address(token), MIN_AMOUNT, MAX_AMOUNT, 604801, "BTC/USD", uint8(IBet.Side.Up), 100e6);
    }

    function test_createBet_revertUnsupportedAsset() public {
        vm.expectRevert(IBetFactory.UnsupportedAsset.selector);
        vm.prank(alice);
        factory.createBet(address(token), MIN_AMOUNT, MAX_AMOUNT, BET_DURATION, "DOGE/USD", uint8(IBet.Side.Up), 100e6);
    }

    function test_createBet_revertUnsupportedToken() public {
        MockERC20 unsupported = new MockERC20("Bad", "BAD", 18);
        vm.expectRevert(IBetFactory.InvalidToken.selector);
        vm.prank(alice);
        factory.createBet(address(unsupported), MIN_AMOUNT, MAX_AMOUNT, BET_DURATION, "BTC/USD", uint8(IBet.Side.Up), 100e6);
    }

    function test_createBet_revertInitiatorAmountTooLow() public {
        vm.expectRevert(IBetFactory.InvalidAmount.selector);
        vm.prank(alice);
        factory.createBet(address(token), MIN_AMOUNT, MAX_AMOUNT, BET_DURATION, "BTC/USD", uint8(IBet.Side.Up), MIN_AMOUNT - 1);
    }

    function test_createBet_revertInitiatorAmountTooHigh() public {
        vm.expectRevert(IBetFactory.InvalidAmount.selector);
        vm.prank(alice);
        factory.createBet(address(token), MIN_AMOUNT, MAX_AMOUNT, BET_DURATION, "BTC/USD", uint8(IBet.Side.Up), MAX_AMOUNT + 1);
    }

    function test_createBet_revertInvalidInitiatorSide() public {
        vm.expectRevert(IBetFactory.InvalidAmount.selector);
        vm.prank(alice);
        factory.createBet(address(token), MIN_AMOUNT, MAX_AMOUNT, BET_DURATION, "BTC/USD", 2, 100e6);
    }

    function test_createBet_secondPlayerMustOpposeAndMatchInitiator() public {
        vm.prank(alice);
        (, address betContract) =
            factory.createBet(address(token), MIN_AMOUNT, MAX_AMOUNT, BET_DURATION, "BTC/USD", uint8(IBet.Side.Up), 150e6);

        Bet bet = Bet(betContract);

        vm.prank(bob);
        token.approve(betContract, type(uint256).max);

        vm.expectRevert(IBet.SecondBetMustOpposeInitiator.selector);
        vm.prank(bob);
        bet.placeBet(IBet.Side.Up, 150e6);

        vm.expectRevert(IBet.SecondBetAmountTooLow.selector);
        vm.prank(bob);
        bet.placeBet(IBet.Side.Down, 100e6);

        vm.prank(bob);
        bet.placeBet(IBet.Side.Down, 150e6);

        assertEq(bet.totalUp(), 150e6);
        assertEq(bet.totalDown(), 150e6);
    }

    /*//////////////////////////////////////////////////////////////
                        ADMIN FUNCTION TESTS
    //////////////////////////////////////////////////////////////*/

    function test_setSupportedToken() public {
        MockERC20 newToken = new MockERC20("USDT", "USDT", 6);

        vm.prank(owner);
        factory.setSupportedToken(address(newToken), true);
        assertTrue(factory.supportedTokens(address(newToken)));

        vm.prank(owner);
        factory.setSupportedToken(address(newToken), false);
        assertFalse(factory.supportedTokens(address(newToken)));
    }

    function test_setSupportedToken_emitsEvent() public {
        MockERC20 newToken = new MockERC20("USDT", "USDT", 6);

        vm.expectEmit(true, false, false, true);
        emit BetFactory.TokenUpdated(address(newToken), true);

        vm.prank(owner);
        factory.setSupportedToken(address(newToken), true);
    }

    function test_setSupportedToken_revertNotOwner() public {
        vm.expectRevert();
        vm.prank(charlie);
        factory.setSupportedToken(address(token), false);
    }

    /*//////////////////////////////////////////////////////////////
                    PRICE ORACLE FACTORY WIRING TESTS
    //////////////////////////////////////////////////////////////*/

    function test_getPriceFeed_proxiesToOracleFactory() public {
        // BTC/USD was registered on oracleFactory in setUp()
        assertEq(factory.getPriceFeed("BTC/USD"), address(priceFeed));

        // Register ETH/USD on the oracle factory and confirm BetFactory sees it
        MockAggregator ethFeed = new MockAggregator(3000e8, 8);
        vm.prank(owner);
        oracleFactory.addOracle("ETH/USD", address(ethFeed));

        assertEq(factory.getPriceFeed("ETH/USD"), address(ethFeed));
    }

    function test_getPriceFeed_zeroWhenOracleFactoryUnset() public {
        vm.prank(owner);
        factory.setPriceOracleFactory(address(0));

        assertEq(factory.getPriceFeed("BTC/USD"), address(0));
    }

    function test_setPriceOracleFactory() public {
        PriceOracleFactory replacement = new PriceOracleFactory(owner);

        vm.prank(owner);
        factory.setPriceOracleFactory(address(replacement));

        assertEq(factory.priceOracleFactory(), address(replacement));
    }

    function test_setPriceOracleFactory_emitsEvent() public {
        PriceOracleFactory replacement = new PriceOracleFactory(owner);

        vm.expectEmit(true, true, false, false);
        emit BetFactory.PriceOracleFactoryUpdated(address(oracleFactory), address(replacement));

        vm.prank(owner);
        factory.setPriceOracleFactory(address(replacement));
    }

    function test_setPriceOracleFactory_revertNotOwner() public {
        vm.expectRevert();
        vm.prank(charlie);
        factory.setPriceOracleFactory(address(0xdead));
    }

    function test_createBet_revertWhenOracleFactoryUnset() public {
        vm.prank(owner);
        factory.setPriceOracleFactory(address(0));

        vm.expectRevert(IBetFactory.UnsupportedAsset.selector);
        vm.prank(alice);
        factory.createBet(address(token), MIN_AMOUNT, MAX_AMOUNT, BET_DURATION, "BTC/USD", uint8(IBet.Side.Up), 100e6);
    }

    /*//////////////////////////////////////////////////////////////
                     DURATION / WINDOW LIMITS
    //////////////////////////////////////////////////////////////*/

    function test_setDurationLimits() public {
        vm.prank(owner);
        factory.setDurationLimits(600, 86400);

        assertEq(factory.minDuration(), 600);
        assertEq(factory.maxDuration(), 86400);
    }

    function test_setDurationLimits_emitsEvent() public {
        vm.expectEmit(false, false, false, true);
        emit BetFactory.DurationLimitsUpdated(600, 86400);

        vm.prank(owner);
        factory.setDurationLimits(600, 86400);
    }

    function test_setDurationLimits_revertInvalid() public {
        vm.expectRevert();
        vm.prank(owner);
        factory.setDurationLimits(120, 86400);
    }

    function test_setDurationLimits_revertNotOwner() public {
        vm.expectRevert();
        vm.prank(charlie);
        factory.setDurationLimits(600, 86400);
    }

    function test_setBettingWindowLimits() public {
        vm.prank(owner);
        factory.setBettingWindowLimits(30, 7200);

        assertEq(factory.minBettingWindow(), 30);
        assertEq(factory.maxBettingWindow(), 7200);
    }

    function test_setBettingWindowLimits_emitsEvent() public {
        vm.expectEmit(false, false, false, true);
        emit BetFactory.BettingWindowLimitsUpdated(30, 7200);

        vm.prank(owner);
        factory.setBettingWindowLimits(30, 7200);
    }

    function test_setBettingWindowLimits_revertInvalid() public {
        vm.expectRevert();
        vm.prank(owner);
        factory.setBettingWindowLimits(0, 100);
    }

    /*//////////////////////////////////////////////////////////////
                          FEE TESTS
    //////////////////////////////////////////////////////////////*/

    function test_setFee() public {
        vm.prank(owner);
        factory.setFee(500, feeCollector);

        assertEq(factory.feeBps(), 500);
        assertEq(factory.feeRecipient(), feeCollector);
    }

    function test_setFee_emitsEvent() public {
        vm.expectEmit(false, false, false, true);
        emit BetFactory.FeeUpdated(500, feeCollector);

        vm.prank(owner);
        factory.setFee(500, feeCollector);
    }

    function test_setFee_zeroFee() public {
        vm.prank(owner);
        factory.setFee(0, address(0));

        assertEq(factory.feeBps(), 0);
    }

    function test_setFee_revertTooHigh() public {
        vm.expectRevert();
        vm.prank(owner);
        factory.setFee(1001, feeCollector);
    }

    function test_setFee_revertNoRecipient() public {
        vm.expectRevert();
        vm.prank(owner);
        factory.setFee(250, address(0)); // non-zero fee but zero recipient
    }

    function test_setFee_revertNotOwner() public {
        vm.expectRevert();
        vm.prank(charlie);
        factory.setFee(500, feeCollector);
    }

    /*//////////////////////////////////////////////////////////////
                         GETTER TESTS
    //////////////////////////////////////////////////////////////*/

    function test_getBet_returnsZeroForNonExistent() public view {
        assertEq(factory.getBet(999), address(0));
    }

    /*//////////////////////////////////////////////////////////////
                       INTEGRATION TEST
    //////////////////////////////////////////////////////////////*/

    function test_fullLifecycle() public {
        // Alice creates bet
        vm.prank(alice);
        (uint256 betId, address betContract) =
            factory.createBet(address(token), MIN_AMOUNT, MAX_AMOUNT, BET_DURATION, "BTC/USD", uint8(IBet.Side.Up), 100e6);

        Bet bet = Bet(betContract);

        // Additional approval for joining bet directly
        vm.prank(bob);
        token.approve(betContract, type(uint256).max);

        vm.prank(bob);
        bet.placeBet(IBet.Side.Down, 100e6);

        assertEq(uint256(bet.status()), uint256(IBet.BetStatus.Open));

        // Lock after deadline + admin grace
        vm.warp(bet.bettingDeadline() + ADMIN_GRACE);
        priceFeed.setPrice(INITIAL_PRICE);
        vm.prank(owner);
        bet.lock();

        assertEq(uint256(bet.status()), uint256(IBet.BetStatus.Locked));

        // Settle (price goes up)
        vm.warp(bet.endTime());
        priceFeed.setPrice(INITIAL_PRICE + 500e8);
        vm.prank(owner);
        bet.settle();

        assertEq(uint256(bet.status()), uint256(IBet.BetStatus.Settled));
        assertEq(uint256(bet.winningSide()), uint256(IBet.Side.Up));

        // Alice claims
        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        bet.claim();

        uint256 totalPool = 200e6;
        uint256 fee = (totalPool * 250) / 10_000;
        uint256 expectedPayout = totalPool - fee;
        assertEq(token.balanceOf(alice), aliceBefore + expectedPayout);

        // Verify factory tracking
        assertEq(factory.getBet(betId), betContract);
        assertEq(factory.getBetCount(), 1);
    }
}
