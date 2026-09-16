// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {UpDownOutcomeToken} from "../src/UpDownOutcomeToken.sol";
import {UpDownMarket} from "../src/UpDownMarket.sol";
import {UpDownMarketFactory} from "../src/UpDownMarketFactory.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockAggregator} from "./mocks/MockAggregator.sol";

/// @notice Minimal in-test `IPriceOracleFactory` implementation: just maps
///         a single asset string to a single MockAggregator address.
contract MockOracleRegistry {
    mapping(bytes32 => address) private _oracles;

    function register(string calldata asset, address oracle) external {
        _oracles[keccak256(bytes(asset))] = oracle;
    }

    function getOracle(string calldata asset) external view returns (address) {
        return _oracles[keccak256(bytes(asset))];
    }
}

contract UpDownMarketTest is Test {
    /*//////////////////////////////////////////////////////////////
                              CONTRACTS
    //////////////////////////////////////////////////////////////*/

    MockERC20            usdc;
    UpDownOutcomeToken   outcomeToken;
    UpDownMarketFactory  factory;
    UpDownMarket         market;
    MockAggregator       aggregator;
    MockOracleRegistry   registry;

    /*//////////////////////////////////////////////////////////////
                              ADDRESSES
    //////////////////////////////////////////////////////////////*/

    address platform = makeAddr("platform");
    address creator  = makeAddr("creator");
    address bob      = makeAddr("bob");
    address carol    = makeAddr("carol");
    address dave     = makeAddr("dave");

    /*//////////////////////////////////////////////////////////////
                              CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint256 constant INIT_LIQUIDITY = 100e6; // 100 USDC

    // The default 1h duration falls in the < 6h bucket → bettingWindow = 1h.
    uint256 constant DURATION = 1 hours;
    uint256 constant BETTING_WINDOW = 1 hours;

    uint8   constant ORACLE_DECIMALS = 8;
    int256  constant START_PRICE_VALUE = 100_000 * 1e8;
    string  constant ASSET = "BTC/USD";

    uint256 marketId;
    uint256 upId;
    uint256 downId;

    /*//////////////////////////////////////////////////////////////
                               SET UP
    //////////////////////////////////////////////////////////////*/

    function setUp() public {
        vm.warp(10_000);

        usdc         = new MockERC20("USD Coin", "USDC", 6);
        outcomeToken = new UpDownOutcomeToken();
        registry     = new MockOracleRegistry();
        aggregator   = new MockAggregator(START_PRICE_VALUE, ORACLE_DECIMALS);
        registry.register(ASSET, address(aggregator));

        factory = new UpDownMarketFactory(address(outcomeToken), platform, address(registry));
        outcomeToken.transferOwnership(address(factory));

        factory.setSupportedToken(address(usdc), true);
        // Allow short durations for testing
        factory.setDurationLimits(1 minutes, 365 days);

        usdc.mint(creator, INIT_LIQUIDITY);
        vm.startPrank(creator);
        usdc.approve(address(factory), INIT_LIQUIDITY);
        address marketAddr;
        (marketId, marketAddr) = factory.createMarket(
            UpDownMarketFactory.CreateMarketParams({
                usdc:          address(usdc),
                duration:      DURATION,
                initLiquidity: INIT_LIQUIDITY,
                asset:         ASSET,
                initialSide:   true // creator opens UP
            })
        );
        vm.stopPrank();
        market = UpDownMarket(marketAddr);
        upId   = outcomeToken.upTokenId(marketId);
        downId = outcomeToken.downTokenId(marketId);

        usdc.mint(bob,   100e6);
        usdc.mint(carol, 100e6);
        usdc.mint(dave,  100e6);
    }

    /*//////////////////////////////////////////////////////////////
                               HELPERS
    //////////////////////////////////////////////////////////////*/

    function _approve(address user, uint256 amount) internal {
        vm.prank(user);
        usdc.approve(address(market), amount);
    }

    function _buyUp(address user, uint256 amount) internal returns (uint256) {
        _approve(user, amount);
        vm.prank(user);
        return market.buyUp(amount, 0);
    }

    function _buyDown(address user, uint256 amount) internal returns (uint256) {
        _approve(user, amount);
        vm.prank(user);
        return market.buyDown(amount, 0);
    }

    function _refreshOracle(int256 price) internal {
        aggregator.setPrice(price);
    }

    /// @dev Skip past bettingDeadline, refresh oracle, then lock.
    function _lock(int256 startPrice) internal {
        vm.warp(market.bettingDeadline());
        _refreshOracle(startPrice);
        market.lock();
    }

    /// @dev Skip past endTime, refresh oracle, then settle.
    function _settle(int256 endPrice) internal {
        vm.warp(market.endTime());
        _refreshOracle(endPrice);
        market.resolveByOracle();
    }

    /*//////////////////////////////////////////////////////////////
                              CREATION
    //////////////////////////////////////////////////////////////*/

    function test_InitialState() public view {
        assertEq(uint256(market.status()), uint256(UpDownMarket.Status.Open));
        assertEq(market.duration(), DURATION);
        assertEq(market.bettingDeadline(), market.creationTime() + BETTING_WINDOW);
        assertEq(market.startPrice(), 0);
        assertEq(market.endPrice(), 0);
        assertEq(market.totalCollateral(), INIT_LIQUIDITY);

        // Half LP, half buy UP — locked LP shares belong to creator.
        assertEq(market.totalLpShares(), 50e6);
        assertEq(market.lockedLpShares(creator), 50e6);
    }

    function test_BettingWindowBucketing_Short() public {
        // 10-minute observation → 1h betting window.
        usdc.mint(creator, INIT_LIQUIDITY);
        vm.startPrank(creator);
        usdc.approve(address(factory), INIT_LIQUIDITY);
        (, address mAddr) = factory.createMarket(
            UpDownMarketFactory.CreateMarketParams({
                usdc:          address(usdc),
                duration:      10 minutes,
                initLiquidity: INIT_LIQUIDITY,
                asset:         ASSET,
                initialSide:   true
            })
        );
        vm.stopPrank();
        UpDownMarket m = UpDownMarket(mAddr);
        assertEq(m.bettingDeadline() - m.creationTime(), 1 hours);
    }

    function test_BettingWindowBucketing_Medium() public {
        // 12h observation → 2h betting window.
        usdc.mint(creator, INIT_LIQUIDITY);
        vm.startPrank(creator);
        usdc.approve(address(factory), INIT_LIQUIDITY);
        (, address mAddr) = factory.createMarket(
            UpDownMarketFactory.CreateMarketParams({
                usdc:          address(usdc),
                duration:      12 hours,
                initLiquidity: INIT_LIQUIDITY,
                asset:         ASSET,
                initialSide:   false
            })
        );
        vm.stopPrank();
        UpDownMarket m = UpDownMarket(mAddr);
        assertEq(m.bettingDeadline() - m.creationTime(), 2 hours);
    }

    function test_BettingWindowBucketing_Long() public {
        // 7-day observation → 6h betting window.
        usdc.mint(creator, INIT_LIQUIDITY);
        vm.startPrank(creator);
        usdc.approve(address(factory), INIT_LIQUIDITY);
        (, address mAddr) = factory.createMarket(
            UpDownMarketFactory.CreateMarketParams({
                usdc:          address(usdc),
                duration:      7 days,
                initLiquidity: INIT_LIQUIDITY,
                asset:         ASSET,
                initialSide:   true
            })
        );
        vm.stopPrank();
        UpDownMarket m = UpDownMarket(mAddr);
        assertEq(m.bettingDeadline() - m.creationTime(), 6 hours);
    }

    /*//////////////////////////////////////////////////////////////
                              TRADING
    //////////////////////////////////////////////////////////////*/

    function test_BuyUp_AndBuyDown() public {
        uint256 upBefore   = market.upReserve();
        uint256 downBefore = market.downReserve();

        uint256 upOut = _buyUp(bob, 10e6);
        assertGt(outcomeToken.balanceOf(bob, upId), 10e6, "bob got > 10 UP via swap");
        assertEq(outcomeToken.balanceOf(bob, upId), upOut);

        // upReserve drained, downReserve increased.
        assertLt(market.upReserve(),  upBefore);
        assertGt(market.downReserve(), downBefore);

        uint256 downOut = _buyDown(carol, 5e6);
        assertEq(outcomeToken.balanceOf(carol, downId), downOut);

        // Invariant: userBalance + reserve = totalCollateral on both sides.
        uint256 totalUp =
            outcomeToken.balanceOf(creator, upId) +
            outcomeToken.balanceOf(bob,     upId) +
            outcomeToken.balanceOf(carol,   upId);
        uint256 totalDown =
            outcomeToken.balanceOf(creator, downId) +
            outcomeToken.balanceOf(bob,     downId) +
            outcomeToken.balanceOf(carol,   downId);
        assertEq(totalUp   + market.upReserve(),   market.totalCollateral(), "UP   invariant");
        assertEq(totalDown + market.downReserve(), market.totalCollateral(), "DOWN invariant");
    }

    function test_BuyRevertsAfterBettingDeadline() public {
        vm.warp(market.bettingDeadline());
        _approve(bob, 10e6);
        vm.prank(bob);
        vm.expectRevert(UpDownMarket.BettingClosed.selector);
        market.buyUp(10e6, 0);
    }

    /*//////////////////////////////////////////////////////////////
                              LIQUIDITY
    //////////////////////////////////////////////////////////////*/

    function test_AddAndRemoveLiquidity() public {
        _approve(bob, 50e6);
        vm.prank(bob);
        uint256 shares = market.addLiquidity(50e6);
        assertEq(market.lpShares(bob), shares);
        assertEq(market.lockedLpShares(bob), 0, "non-creator LP not locked");

        // Remove half
        vm.prank(bob);
        market.removeLiquidity(shares / 2);
        assertEq(market.lpShares(bob), shares - shares / 2);
    }

    function test_RemoveLiquidity_LockedSharesReverts() public {
        // Creator tries to remove their locked LP.
        uint256 shares = market.lpShares(creator);
        vm.prank(creator);
        vm.expectRevert(UpDownMarket.LpSharesLocked.selector);
        market.removeLiquidity(shares);
    }

    function test_LiquidityOpsRevertAfterDeadline() public {
        vm.warp(market.bettingDeadline());

        _approve(bob, 10e6);
        vm.prank(bob);
        vm.expectRevert(UpDownMarket.BettingClosed.selector);
        market.addLiquidity(10e6);

        vm.prank(creator);
        vm.expectRevert(UpDownMarket.BettingClosed.selector);
        market.removeLiquidity(1);
    }

    /*//////////////////////////////////////////////////////////////
                              LOCK
    //////////////////////////////////////////////////////////////*/

    function test_Lock_Permissionless() public {
        _buyUp(bob, 5e6);

        vm.warp(market.bettingDeadline());
        _refreshOracle(START_PRICE_VALUE);

        // Permissionless — anyone can call.
        vm.prank(dave);
        market.lock();

        assertEq(uint256(market.status()), uint256(UpDownMarket.Status.Locked));
        assertEq(market.startPrice(), START_PRICE_VALUE);
        assertEq(market.startTime(),  block.timestamp);
        assertEq(market.endTime(),    block.timestamp + DURATION);
    }

    function test_LockBeforeDeadlineReverts() public {
        _refreshOracle(START_PRICE_VALUE);
        vm.expectRevert(UpDownMarket.BettingNotClosed.selector);
        market.lock();
    }

    function test_LockStaleOracleReverts() public {
        vm.warp(market.bettingDeadline());
        // Oracle updated at construction (long ago); MAX_ORACLE_STALENESS is 1 hour.
        vm.warp(market.bettingDeadline() + 2 hours);
        vm.expectRevert(UpDownMarket.OracleStale.selector);
        market.lock();
    }

    function test_BuyAfterLockReverts() public {
        _lock(START_PRICE_VALUE);

        _approve(bob, 10e6);
        vm.prank(bob);
        vm.expectRevert(UpDownMarket.MarketNotOpen.selector);
        market.buyUp(10e6, 0);
    }

    function test_PairRedeem_AllowedDuringLocked() public {
        // Bob buys a pair via mint-only path: 10 USDC → 10 UP + 10 DOWN
        // We don't have a direct mint helper, so simulate by:
        // 1) bob buys UP (gets >10 UP), 2) bob buys DOWN (gets >10 DOWN)
        // After both, bob can pair-redeem the symmetric portion.
        _buyUp(bob, 10e6);
        _buyDown(bob, 10e6);

        uint256 upBal   = outcomeToken.balanceOf(bob, upId);
        uint256 downBal = outcomeToken.balanceOf(bob, downId);
        uint256 sym     = upBal < downBal ? upBal : downBal;

        _lock(START_PRICE_VALUE);

        // Pair redeem in Locked state is allowed.
        uint256 usdcBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        market.redeemPair(sym);
        assertEq(usdc.balanceOf(bob) - usdcBefore, sym, "pair redeem returns 1:1 USDC");
    }

    /*//////////////////////////////////////////////////////////////
                              SETTLEMENT
    //////////////////////////////////////////////////////////////*/

    function test_Settle_UpWins() public {
        _buyUp(bob, 10e6);
        _buyDown(carol, 10e6);

        _lock(START_PRICE_VALUE);
        _settle(START_PRICE_VALUE + 1); // price rose by one unit → UP wins

        assertEq(uint256(market.status()), uint256(UpDownMarket.Status.Resolved));
        assertTrue(market.upWins());
        assertFalse(market.isDraw());
        assertGt(market.netUsdcPerToken(), 0);
    }

    function test_Settle_DownWins() public {
        _buyUp(bob, 10e6);
        _buyDown(carol, 10e6);

        _lock(START_PRICE_VALUE);
        _settle(START_PRICE_VALUE - 1);

        assertFalse(market.upWins());
        assertFalse(market.isDraw());
    }

    function test_Settle_Draw_NoFees() public {
        _buyUp(bob, 10e6);
        _buyDown(carol, 10e6);

        uint256 platformBefore = usdc.balanceOf(platform);
        uint256 creatorBefore  = usdc.balanceOf(creator);

        _lock(START_PRICE_VALUE);
        _settle(START_PRICE_VALUE); // equal → draw

        assertTrue(market.isDraw());
        // On draw: no platform/creator fee transfer.
        assertEq(usdc.balanceOf(platform), platformBefore);
        assertEq(usdc.balanceOf(creator),  creatorBefore);
        // Per-token rate is 0.5 USDC for both sides.
        assertEq(market.netUsdcPerToken(), 0.5e18);
    }

    /*//////////////////////////////////////////////////////////////
                              REDEEM
    //////////////////////////////////////////////////////////////*/

    function test_Redeem_WinnerOnly() public {
        _buyUp(bob, 10e6);     // bob bets UP
        _buyDown(carol, 10e6); // carol bets DOWN

        _lock(START_PRICE_VALUE);
        _settle(START_PRICE_VALUE + 1); // UP wins

        // Bob can redeem UP.
        uint256 bobUp = outcomeToken.balanceOf(bob, upId);
        uint256 bobUsdcBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        market.redeem(upId, bobUp);
        assertGt(usdc.balanceOf(bob), bobUsdcBefore);

        // Carol cannot redeem DOWN.
        uint256 carolDown = outcomeToken.balanceOf(carol, downId);
        vm.prank(carol);
        vm.expectRevert(UpDownMarket.NotWinningToken.selector);
        market.redeem(downId, carolDown);
    }

    function test_Redeem_Draw_BothSides() public {
        _buyUp(bob, 10e6);
        _buyDown(carol, 10e6);

        _lock(START_PRICE_VALUE);
        _settle(START_PRICE_VALUE); // draw

        // Both bob (UP) and carol (DOWN) can redeem at 0.5 USDC / token.
        uint256 bobUp = outcomeToken.balanceOf(bob, upId);
        vm.prank(bob);
        market.redeem(upId, bobUp);
        assertEq(usdc.balanceOf(bob), 100e6 - 10e6 + (bobUp / 2));

        uint256 carolDown = outcomeToken.balanceOf(carol, downId);
        vm.prank(carol);
        market.redeem(downId, carolDown);
        assertEq(usdc.balanceOf(carol), 100e6 - 10e6 + (carolDown / 2));
    }

    function test_LpClaim_WhenUpWins() public {
        _buyUp(bob, 10e6);
        _buyDown(carol, 10e6);

        _lock(START_PRICE_VALUE);
        _settle(START_PRICE_VALUE + 1);

        uint256 creatorUsdcBefore = usdc.balanceOf(creator);
        vm.prank(creator);
        market.claimLpPayout();
        assertGt(usdc.balanceOf(creator), creatorUsdcBefore, "LP got something");
    }

    function test_LpClaim_OnDraw() public {
        _buyUp(bob, 10e6);
        _buyDown(carol, 10e6);

        _lock(START_PRICE_VALUE);
        _settle(START_PRICE_VALUE);

        uint256 creatorUsdcBefore = usdc.balanceOf(creator);
        vm.prank(creator);
        market.claimLpPayout();
        assertGt(usdc.balanceOf(creator), creatorUsdcBefore, "LP draw payout");
    }

    /*//////////////////////////////////////////////////////////////
                          MANUAL FALLBACK
    //////////////////////////////////////////////////////////////*/

    function test_ManualResolve_FromLocked() public {
        _buyUp(bob, 10e6);
        _buyDown(carol, 10e6);

        _lock(START_PRICE_VALUE);

        // Owner forces DOWN-wins via manual path (startPriceOverride ignored
        // since already locked).
        factory.resolveMarket(marketId, 0, START_PRICE_VALUE - 1, "manual: oracle dead");

        assertEq(uint256(market.status()), uint256(UpDownMarket.Status.Resolved));
        assertFalse(market.upWins());
        assertFalse(market.isDraw());
    }

    function test_ManualResolve_FromOpen() public {
        // Don't lock — go straight from Open to Resolved via manual path.
        factory.resolveMarket(
            marketId,
            START_PRICE_VALUE,         // startPriceOverride applied
            START_PRICE_VALUE,         // equal → draw
            "manual: cancel"
        );

        assertEq(uint256(market.status()), uint256(UpDownMarket.Status.Resolved));
        assertTrue(market.isDraw());
        assertEq(market.startPrice(), START_PRICE_VALUE);
    }

    function test_ManualResolve_NotOwnerReverts() public {
        vm.prank(bob);
        vm.expectRevert(); // Ownable revert
        factory.resolveMarket(marketId, 0, START_PRICE_VALUE + 1, "x");
    }

    /*//////////////////////////////////////////////////////////////
                          ORACLE EDGE CASES
    //////////////////////////////////////////////////////////////*/

    function test_ResolveTooEarlyReverts() public {
        _lock(START_PRICE_VALUE);
        // endTime not yet reached.
        vm.expectRevert(UpDownMarket.TooEarlyToResolve.selector);
        market.resolveByOracle();
    }

    function test_CannotLockTwice() public {
        _lock(START_PRICE_VALUE);
        vm.warp(market.bettingDeadline() + 10);
        vm.expectRevert(UpDownMarket.MarketNotOpen.selector);
        market.lock();
    }
}
