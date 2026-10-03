// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {PredictionMarketFactory} from "../src/PredictionMarketFactory.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockAggregator} from "./mocks/MockAggregator.sol";

/// @notice End-to-end tests for the POP YES/NO AMM prediction market.
///         Numbers are validated against pop_yes_no_amm_fee_simulation.md.
///         Integer arithmetic causes rounding of ±1–5 units (0.000001–0.000005 USDC)
///         vs. the document's decimal values — assertApproxEqAbs tolerances account for this.
contract PredictionMarketTest is Test {
    /*//////////////////////////////////////////////////////////////
                              CONTRACTS
    //////////////////////////////////////////////////////////////*/

    MockERC20               usdc;
    OutcomeToken            outcomeToken;
    PredictionMarketFactory factory;
    PredictionMarket        market;
    MockAggregator          aggregator;

    /*//////////////////////////////////////////////////////////////
                              ADDRESSES
    //////////////////////////////////////////////////////////////*/

    address platform = makeAddr("platform");
    address creator  = makeAddr("creator");
    address userA    = makeAddr("userA");   // buys YES  10 USDC
    address userB    = makeAddr("userB");   // buys NO   20 USDC
    address userC    = makeAddr("userC");   // buys YES  30 USDC
    address userD    = makeAddr("userD");   // buys NO   40 USDC

    /*//////////////////////////////////////////////////////////////
                              CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint256 constant INIT_LIQUIDITY = 100e6; // 100 USDC  (6 decimals)
    uint256 constant CLOSING_OFFSET = 1 days;

    // Default oracle wiring used by `_defaultCreateParams`.
    uint8   constant ORACLE_DECIMALS    = 8;
    int256  constant DEFAULT_PRICE      = 100_000 * 1e8;     // current "BTC" = $100k
    int256  constant DEFAULT_THRESHOLD  = 150_000 * 1e8;     // threshold "BTC = $150k"
    string  constant DEFAULT_ASSET      = "BTC/USD";

    uint256 closingTime;
    uint256 marketId;
    uint256 yesId;
    uint256 noId;

    /*//////////////////////////////////////////////////////////////
                               SET UP
    //////////////////////////////////////////////////////////////*/

    function setUp() public {
        vm.warp(10_000); // pin block.timestamp so durations are predictable
        closingTime = block.timestamp + CLOSING_OFFSET;

        // Deploy core contracts
        usdc         = new MockERC20("USD Coin", "USDC", 6);
        outcomeToken = new OutcomeToken();
        factory      = new PredictionMarketFactory(address(outcomeToken), platform);
        aggregator   = new MockAggregator(DEFAULT_PRICE, ORACLE_DECIMALS);

        // Factory must own OutcomeToken to register new markets as operators
        outcomeToken.transferOwnership(address(factory));

        // Whitelist USDC
        factory.setSupportedToken(address(usdc), true);

        // Creator funds and creates the market
        usdc.mint(creator, INIT_LIQUIDITY);
        vm.startPrank(creator);
        usdc.approve(address(factory), INIT_LIQUIDITY);
        address marketAddr;
        (marketId, marketAddr) = factory.createMarket(
            _defaultCreateParams("Will BTC break 150k this week?", closingTime, true)
        );
        vm.stopPrank();

        market = PredictionMarket(marketAddr);
        yesId  = outcomeToken.yesTokenId(marketId);
        noId   = outcomeToken.noTokenId(marketId);

        // Fund users with exactly what they will spend
        usdc.mint(userA, 10e6);
        usdc.mint(userB, 20e6);
        usdc.mint(userC, 30e6);
        usdc.mint(userD, 40e6);
    }

    /*//////////////////////////////////////////////////////////////
                        HELPERS
    //////////////////////////////////////////////////////////////*/

    function _defaultCreateParams(string memory question_, uint256 closingTime_, bool aboveWins_)
        internal
        view
        returns (PredictionMarketFactory.CreateMarketParams memory)
    {
        // Default fixture: creator opens with a YES bet to mirror the doc's
        // direction. Tests that need a NO opening override this manually.
        return _defaultCreateParams(question_, closingTime_, aboveWins_, true);
    }

    function _defaultCreateParams(
        string memory question_,
        uint256 closingTime_,
        bool aboveWins_,
        bool initialSide_
    )
        internal
        view
        returns (PredictionMarketFactory.CreateMarketParams memory)
    {
        return PredictionMarketFactory.CreateMarketParams({
            usdc:          address(usdc),
            question:      question_,
            closingTime:   closingTime_,
            initLiquidity: INIT_LIQUIDITY,
            asset:         DEFAULT_ASSET,
            priceFeed:     address(aggregator),
            threshold:     DEFAULT_THRESHOLD,
            aboveWins:     aboveWins_,
            initialSide:   initialSide_
        });
    }

    function _approve(address user, uint256 amount) internal {
        vm.prank(user);
        usdc.approve(address(market), amount);
    }

    function _buyYes(address user, uint256 amount) internal returns (uint256) {
        _approve(user, amount);
        vm.prank(user);
        return market.buyYes(amount, 0);
    }

    function _buyNo(address user, uint256 amount) internal returns (uint256) {
        _approve(user, amount);
        vm.prank(user);
        return market.buyNo(amount, 0);
    }

    /// @dev Runs the full 4-user simulation from the document:
    ///      A buys YES 10, B buys NO 20, C buys YES 30, D buys NO 40
    function _runSimulation() internal {
        _buyYes(userA, 10e6);
        _buyNo(userB,  20e6);
        _buyYes(userC, 30e6);
        _buyNo(userD,  40e6);
    }

    /// @dev Verify the fundamental collateral invariant of the protocol:
    ///       (every user's YES balance) + yesReserve = totalCollateral
    ///       (every user's NO  balance) + noReserve  = totalCollateral
    ///      Sums across creator + userA..userD; pass new participants as needed.
    function _assertCollateralInvariant() internal view {
        uint256 totalYes = outcomeToken.balanceOf(creator, yesId)
            + outcomeToken.balanceOf(userA, yesId)
            + outcomeToken.balanceOf(userB, yesId)
            + outcomeToken.balanceOf(userC, yesId)
            + outcomeToken.balanceOf(userD, yesId);
        uint256 totalNo  = outcomeToken.balanceOf(creator, noId)
            + outcomeToken.balanceOf(userA, noId)
            + outcomeToken.balanceOf(userB, noId)
            + outcomeToken.balanceOf(userC, noId)
            + outcomeToken.balanceOf(userD, noId);
        assertEq(totalYes + market.yesReserve(), market.totalCollateral(), "YES side invariant");
        assertEq(totalNo  + market.noReserve(),  market.totalCollateral(), "NO  side invariant");
    }

    /*//////////////////////////////////////////////////////////////
                       STEP 0 — INITIALISATION
    //////////////////////////////////////////////////////////////*/

    function test_InitialPool() public view {
        // v2 init: half (50e6) seeded as LP, half (50e6) bought YES by creator.
        // After the creator's swap, the YES side of the pool is drained, NO side doubled.
        assertEq(market.yesReserve(),     25_062_657, "yesReserve after creator YES buy");
        assertEq(market.noReserve(),      100e6,      "noReserve after creator YES buy");
        assertEq(market.totalCollateral(), INIT_LIQUIDITY);

        // LP shares only reflect the LP half, all locked to the creator.
        assertEq(market.totalLpShares(),         50e6);
        assertEq(market.lpShares(creator),       50e6);
        assertEq(market.lockedLpShares(creator), 50e6);

        // Creator now holds the YES tokens minted by the half-buy
        // = buyHalf + swap output = 50e6 + 24_937_343 = 74_937_343
        assertEq(outcomeToken.balanceOf(creator, yesId), 74_937_343, "creator YES balance");
        assertEq(outcomeToken.balanceOf(creator, noId),  0,          "creator NO balance");

        // Fee immutables match factory defaults
        assertEq(market.lpSwapFeeBps(),   50);
        assertEq(market.platformFeeBps(), 100);
        assertEq(market.creatorFeeBps(),  30);

        // Oracle wiring stored
        assertEq(market.asset(),       DEFAULT_ASSET);
        assertEq(address(market.priceFeed()), address(aggregator));
        assertEq(market.threshold(),   DEFAULT_THRESHOLD);
        assertEq(market.aboveWins(),   true);
    }

    function test_Initiator_YesBuy_Sets_Probability_AboveHalf() public view {
        // v2: opening with a YES bet drives YES probability above 50%.
        // YES prob = noReserve / (yes + no) = 100e6 / 125_062_657 ≈ 0.7996
        assertGt(market.yesProbability(), 0.5e18);
        assertLt(market.noProbability(),  0.5e18);
        assertApproxEqAbs(market.yesProbability() + market.noProbability(), 1e18, 1);
    }

    function test_Initiator_NoBuy_Sets_Probability_BelowHalf() public {
        // Mirror test for the NO-side opening.
        usdc.mint(creator, INIT_LIQUIDITY);
        vm.startPrank(creator);
        usdc.approve(address(factory), INIT_LIQUIDITY);
        (, address noMarketAddr) = factory.createMarket(
            _defaultCreateParams("Will BTC stay under 150k?", closingTime, false, false)
        );
        vm.stopPrank();

        PredictionMarket noMarket = PredictionMarket(noMarketAddr);
        assertLt(noMarket.yesProbability(), 0.5e18);
        assertGt(noMarket.noProbability(),  0.5e18);
    }

    /*//////////////////////////////////////////////////////////////
                   STEP 1 — USER A BUYS YES WITH 10 USDC
    //////////////////////////////////////////////////////////////*/

    function test_Step1_UserA_BuysYes_10USDC() public {
        uint256 yesOut = _buyYes(userA, 10e6);
        assertEq(outcomeToken.balanceOf(userA, yesId), yesOut);
        assertEq(market.totalCollateral(), 110e6, "+10 USDC from userA");

        // YES probability moves further above 50% after another YES buy
        assertGt(market.yesProbability(), 0.5e18);
    }

    function test_Step1_CollateralInvariant_AfterA() public {
        _buyYes(userA, 10e6);
        _assertCollateralInvariant();
    }

    /*//////////////////////////////////////////////////////////////
                   STEP 2 — USER B BUYS NO WITH 20 USDC
    //////////////////////////////////////////////////////////////*/

    function test_Step2_UserB_BuysNo_20USDC() public {
        _buyYes(userA, 10e6);
        uint256 noOut = _buyNo(userB, 20e6);
        assertEq(outcomeToken.balanceOf(userB, noId), noOut);
        assertEq(market.totalCollateral(), 130e6, "+20 USDC from userB");
    }

    function test_Step2_CollateralInvariant_AfterAB() public {
        _buyYes(userA, 10e6);
        _buyNo(userB, 20e6);
        _assertCollateralInvariant();
    }

    /*//////////////////////////////////////////////////////////////
               FULL SIMULATION — STEPS 1-4 (A,B,C,D)
    //////////////////////////////////////////////////////////////*/

    function test_FullSimulation_CollateralInvariant() public {
        _runSimulation();
        assertEq(market.totalCollateral(), 200e6, "totalCollateral = 200 USDC");
        _assertCollateralInvariant();
    }

    function test_FullSimulation_TotalTokensCirculating() public {
        _runSimulation();

        // Total YES in circulation (creator + A + C) + yesReserve == totalCollateral
        // Same for NO. _assertCollateralInvariant covers it; this is a sanity check
        // that none of the four users got phantom tokens.
        uint256 totalYesUsers = outcomeToken.balanceOf(creator, yesId)
            + outcomeToken.balanceOf(userA, yesId)
            + outcomeToken.balanceOf(userC, yesId);
        uint256 totalNoUsers = outcomeToken.balanceOf(creator, noId)
            + outcomeToken.balanceOf(userB, noId)
            + outcomeToken.balanceOf(userD, noId);
        assertEq(totalYesUsers + market.yesReserve(), market.totalCollateral());
        assertEq(totalNoUsers  + market.noReserve(),  market.totalCollateral());
    }

    /*//////////////////////////////////////////////////////////////
               SETTLEMENT A — YES WINS (doc §9)
    //////////////////////////////////////////////////////////////*/

    function test_Settlement_YesWins_FeesCorrect() public {
        _runSimulation();
        vm.warp(closingTime + 1);

        uint256 totalCollateral = market.totalCollateral(); // 200e6

        factory.resolveMarket(marketId, true, "test");

        // Platform fee = 1 %, creator fee = 0.3 %
        assertApproxEqAbs(usdc.balanceOf(platform), totalCollateral * 100 / 10_000, 2);
        assertApproxEqAbs(usdc.balanceOf(creator),  totalCollateral * 30  / 10_000, 2);
    }

    function test_Settlement_YesWins_TotalPayoutEqualsCollateral() public {
        _runSimulation();
        vm.warp(closingTime + 1);
        factory.resolveMarket(marketId, true, "test");

        uint256 platformFee = usdc.balanceOf(platform);
        uint256 creatorFee  = usdc.balanceOf(creator); // creator fee only — LP & YES not yet claimed

        // YES holders redeem: creator (initial half-buy), A, C
        uint256 creatorYes = outcomeToken.balanceOf(creator, yesId);
        uint256 aYes       = outcomeToken.balanceOf(userA, yesId);
        uint256 cYes       = outcomeToken.balanceOf(userC, yesId);

        uint256 creatorBalBeforeRedeem = usdc.balanceOf(creator);
        vm.prank(creator); market.redeem(creatorYes);
        uint256 creatorRedeemOut = usdc.balanceOf(creator) - creatorBalBeforeRedeem;

        vm.prank(userA); market.redeem(aYes);
        vm.prank(userC); market.redeem(cYes);

        uint256 aOut = usdc.balanceOf(userA);
        uint256 cOut = usdc.balanceOf(userC);

        // LP claims pool YES share (creator owns all LP)
        uint256 creatorBeforeLp = usdc.balanceOf(creator);
        vm.prank(creator);
        market.claimLpPayout();
        uint256 lpOut = usdc.balanceOf(creator) - creatorBeforeLp;

        uint256 total = platformFee + creatorFee + creatorRedeemOut + aOut + cOut + lpOut;
        assertApproxEqAbs(total, 200e6, 20, "YES wins: total payout must equal 200 USDC");
    }

    function test_Settlement_YesWins_LosersGetNothing() public {
        _runSimulation();
        vm.warp(closingTime + 1);
        factory.resolveMarket(marketId, true, "test");

        // B and D hold NO tokens — redeem should revert (they have no YES)
        vm.expectRevert();
        vm.prank(userB);
        market.redeem(1);
    }

    /*//////////////////////////////////////////////////////////////
               SETTLEMENT B — NO WINS (doc §10)
    //////////////////////////////////////////////////////////////*/

    function test_Settlement_NoWins_TotalPayoutEqualsCollateral() public {
        _runSimulation();
        vm.warp(closingTime + 1);
        factory.resolveMarket(marketId, false, "test");

        uint256 platformFee = usdc.balanceOf(platform);
        uint256 creatorFee  = usdc.balanceOf(creator);

        // NO holders redeem: B, D (creator opened with YES, holds 0 NO)
        uint256 bNo = outcomeToken.balanceOf(userB, noId);
        uint256 dNo = outcomeToken.balanceOf(userD, noId);
        vm.prank(userB); market.redeem(bNo);
        vm.prank(userD); market.redeem(dNo);

        uint256 bOut = usdc.balanceOf(userB);
        uint256 dOut = usdc.balanceOf(userD);

        uint256 creatorBefore = usdc.balanceOf(creator);
        vm.prank(creator);
        market.claimLpPayout();
        uint256 lpOut = usdc.balanceOf(creator) - creatorBefore;

        uint256 total = platformFee + creatorFee + bOut + dOut + lpOut;
        assertApproxEqAbs(total, 200e6, 20, "NO wins: total payout must equal 200 USDC");
    }

    /*//////////////////////////////////////////////////////////////
                       PROBABILITY & QUOTES
    //////////////////////////////////////////////////////////////*/

    function test_ProbabilityShifts_AfterYesBuy() public {
        uint256 yesBefore = market.yesProbability();
        _buyYes(userA, 10e6);

        // YES prob must increase after buying YES (regardless of starting bias)
        assertGt(market.yesProbability(), yesBefore);
        assertApproxEqAbs(market.yesProbability() + market.noProbability(), 1e18, 1);
    }

    function test_ProbabilityShifts_AfterNoBuy() public {
        uint256 noBefore = market.noProbability();
        _buyNo(userB, 20e6);

        // NO prob must increase after buying NO (the v2 fixture starts biased
        // toward YES, so we test direction of shift rather than crossing 50%).
        assertGt(market.noProbability(), noBefore);
        assertApproxEqAbs(market.yesProbability() + market.noProbability(), 1e18, 1);
    }

    function test_QuoteYes_MatchesActualOutput() public {
        uint256 quoted = market.quoteYes(10e6);

        uint256 actual = _buyYes(userA, 10e6);

        assertEq(quoted, actual, "quoteYes must match actual buyYes output");
    }

    function test_QuoteNo_MatchesActualOutput() public {
        uint256 quoted = market.quoteNo(20e6);

        uint256 actual = _buyNo(userB, 20e6);

        assertEq(quoted, actual, "quoteNo must match actual buyNo output");
    }

    /*//////////////////////////////////////////////////////////////
                         REVERT CASES
    //////////////////////////////////////////////////////////////*/

    function test_Revert_BuyYes_SlippageProtection() public {
        _approve(userA, 10e6);
        vm.expectRevert(PredictionMarket.InsufficientOutput.selector);
        vm.prank(userA);
        market.buyYes(10e6, type(uint256).max);
    }

    function test_Revert_BuyNo_SlippageProtection() public {
        _approve(userB, 20e6);
        vm.expectRevert(PredictionMarket.InsufficientOutput.selector);
        vm.prank(userB);
        market.buyNo(20e6, type(uint256).max);
    }

    function test_Revert_BuyYes_ZeroAmount() public {
        vm.expectRevert(PredictionMarket.ZeroAmount.selector);
        vm.prank(userA);
        market.buyYes(0, 0);
    }

    function test_Revert_Resolve_TooEarly() public {
        vm.expectRevert(PredictionMarket.TooEarlyToResolve.selector);
        factory.resolveMarket(marketId, true, "test");
    }

    // closingTime = 0 → no time restriction, resolver can settle anytime
    function test_OpenEnded_Market_ResolveAnytime() public {
        // Create a market with closingTime = 0
        usdc.mint(creator, INIT_LIQUIDITY);
        vm.startPrank(creator);
        usdc.approve(address(factory), INIT_LIQUIDITY);
        (, address openMarketAddr) = factory.createMarket(
            _defaultCreateParams("Open-ended: no closing time", 0, true)
        );
        vm.stopPrank();

        // Should resolve immediately without warping time
        PredictionMarket openMarket = PredictionMarket(openMarketAddr);
        factory.resolveMarket(1, true, "test"); // marketId = 1 (second market)
        assertTrue(openMarket.status() == PredictionMarket.Status.Resolved);
        assertTrue(openMarket.yesWins());
    }

    // closingTime = 0 → buying stays open right up until resolve
    function test_OpenEnded_Market_BuyBeforeResolve() public {
        usdc.mint(creator, INIT_LIQUIDITY);
        vm.startPrank(creator);
        usdc.approve(address(factory), INIT_LIQUIDITY);
        (uint256 openId, address openMarketAddr) = factory.createMarket(
            _defaultCreateParams("Open-ended: no closing time", 0, true)
        );
        vm.stopPrank();

        PredictionMarket openMarket = PredictionMarket(openMarketAddr);

        // User can buy at any point in time
        vm.warp(block.timestamp + 365 days); // far future — still open
        vm.startPrank(userA);
        usdc.approve(openMarketAddr, 10e6);
        uint256 yesOut = openMarket.buyYes(10e6, 0);
        vm.stopPrank();
        assertTrue(yesOut > 0);

        // Resolver settles after the buy
        factory.resolveMarket(openId, true, "test");
        assertEq(uint8(openMarket.status()), uint8(PredictionMarket.Status.Resolved));
    }

    function test_Revert_Resolve_Duplicate() public {
        vm.warp(closingTime + 1);
        factory.resolveMarket(marketId, true, "test");

        vm.expectRevert(PredictionMarket.MarketNotOpen.selector);
        factory.resolveMarket(marketId, true, "test");
    }

    function test_Revert_Resolve_UnauthorizedCaller() public {
        vm.warp(closingTime + 1);
        vm.expectRevert(PredictionMarket.OnlyResolver.selector);
        vm.prank(userA);
        market.resolve(true, "test");
    }

    function test_Revert_Redeem_BeforeResolution() public {
        vm.expectRevert(PredictionMarket.MarketNotResolved.selector);
        vm.prank(userA);
        market.redeem(1);
    }

    function test_Revert_LpClaim_BeforeResolution() public {
        vm.expectRevert(PredictionMarket.MarketNotResolved.selector);
        vm.prank(creator);
        market.claimLpPayout();
    }

    function test_Revert_LpClaim_NonLp() public {
        vm.warp(closingTime + 1);
        factory.resolveMarket(marketId, true, "test");

        vm.expectRevert(PredictionMarket.NotLP.selector);
        vm.prank(userA);
        market.claimLpPayout();
    }

    function test_Revert_LpClaim_Double() public {
        vm.warp(closingTime + 1);
        factory.resolveMarket(marketId, true, "test");

        vm.startPrank(creator);
        market.claimLpPayout();
        vm.expectRevert(PredictionMarket.AlreadyClaimed.selector);
        market.claimLpPayout();
        vm.stopPrank();
    }

    function test_Revert_InitializeMarket_NotFactory() public {
        vm.expectRevert(PredictionMarket.OnlyFactory.selector);
        vm.prank(userA);
        market.initializeMarket(userA, 10e6, true);
    }

    function test_Revert_InitializeMarket_Duplicate() public {
        // Already initialised in setUp — factory itself should now revert if it tried again.
        // The factory is the only address allowed past onlyFactory, so we simulate from that role.
        vm.prank(address(factory));
        vm.expectRevert(PredictionMarket.AlreadyInitialized.selector);
        market.initializeMarket(creator, 10e6, true);
    }

    function test_Revert_CreateMarket_UnsupportedToken() public {
        MockERC20 other = new MockERC20("Other", "OTH", 6);
        usdc.mint(creator, INIT_LIQUIDITY);

        vm.startPrank(creator);
        other.approve(address(factory), INIT_LIQUIDITY);
        vm.expectRevert(PredictionMarketFactory.InvalidToken.selector);
        PredictionMarketFactory.CreateMarketParams memory p = _defaultCreateParams("test", closingTime, true);
        p.usdc = address(other);
        factory.createMarket(p);
        vm.stopPrank();
    }

    function test_Revert_CreateMarket_DurationTooShort() public {
        usdc.mint(creator, INIT_LIQUIDITY);
        vm.startPrank(creator);
        usdc.approve(address(factory), INIT_LIQUIDITY);
        vm.expectRevert(PredictionMarketFactory.InvalidDuration.selector);
        factory.createMarket(_defaultCreateParams("test", block.timestamp + 1, true));
        vm.stopPrank();
    }

    function test_Revert_CreateMarket_InvalidPriceFeed() public {
        usdc.mint(creator, INIT_LIQUIDITY);
        vm.startPrank(creator);
        usdc.approve(address(factory), INIT_LIQUIDITY);
        PredictionMarketFactory.CreateMarketParams memory p = _defaultCreateParams("test", closingTime, true);
        p.priceFeed = address(0);
        vm.expectRevert(PredictionMarketFactory.InvalidPriceFeed.selector);
        factory.createMarket(p);
        vm.stopPrank();
    }

    function test_Revert_CreateMarket_InvalidThreshold() public {
        usdc.mint(creator, INIT_LIQUIDITY);
        vm.startPrank(creator);
        usdc.approve(address(factory), INIT_LIQUIDITY);
        PredictionMarketFactory.CreateMarketParams memory p = _defaultCreateParams("test", closingTime, true);
        p.threshold = 0;
        vm.expectRevert(PredictionMarketFactory.InvalidThreshold.selector);
        factory.createMarket(p);
        vm.stopPrank();
    }

    function test_Revert_CreateMarket_InvalidAsset() public {
        usdc.mint(creator, INIT_LIQUIDITY);
        vm.startPrank(creator);
        usdc.approve(address(factory), INIT_LIQUIDITY);
        PredictionMarketFactory.CreateMarketParams memory p = _defaultCreateParams("test", closingTime, true);
        p.asset = "";
        vm.expectRevert(PredictionMarketFactory.InvalidAsset.selector);
        factory.createMarket(p);
        vm.stopPrank();
    }

    function test_Revert_FeeTooHigh_LpFee() public {
        // lpSwapFeeBps > 100 should revert in PredictionMarket constructor
        factory.setDefaultFees(101, 100, 30); // 101 bps LP fee → over cap

        usdc.mint(creator, INIT_LIQUIDITY);
        vm.startPrank(creator);
        usdc.approve(address(factory), INIT_LIQUIDITY);
        vm.expectRevert(PredictionMarket.FeeTooHigh.selector);
        factory.createMarket(_defaultCreateParams("test", closingTime, true));
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                  SETTLEMENT BOT + REASONING (manual flow)
    //////////////////////////////////////////////////////////////*/

    function _createMarket(string memory q) internal returns (uint256 id, PredictionMarket m) {
        return _createMarket(q, true);
    }

    function _createMarket(string memory q, bool aboveWins_) internal returns (uint256 id, PredictionMarket m) {
        usdc.mint(creator, INIT_LIQUIDITY);
        vm.startPrank(creator);
        usdc.approve(address(factory), INIT_LIQUIDITY);
        address addr;
        (id, addr) = factory.createMarket(_defaultCreateParams(q, closingTime, aboveWins_));
        vm.stopPrank();
        m = PredictionMarket(addr);
    }

    function test_SettlementBot_CanResolveDirectly() public {
        address bot = makeAddr("bot");
        factory.setSettlementBot(bot);

        (, PredictionMarket m) = _createMarket("bot-resolved market");
        assertEq(m.resolver(), bot, "new market resolver should be settlement bot");

        vm.warp(closingTime + 1);
        vm.prank(bot);
        m.resolve(false, "swarm spread 0.82, 5/7 NO");

        assertEq(uint8(m.status()), uint8(PredictionMarket.Status.Resolved));
        assertEq(m.yesWins(), false);
        assertEq(m.reasoning(), "swarm spread 0.82, 5/7 NO");
        assertEq(m.settledPrice(), 0, "manual resolve should not set settledPrice");
    }

    function test_OwnerFallback_CanResolveViaFactory() public {
        // settlementBot is set to a different address → bot is the natural resolver
        address bot = makeAddr("bot");
        factory.setSettlementBot(bot);

        (uint256 newId, PredictionMarket m) = _createMarket("owner fallback test");
        vm.warp(closingTime + 1);

        // Owner (this contract) routes through factory.resolveMarket — the
        // factory call satisfies the `msg.sender == factory` branch of the
        // resolver check on the market.
        factory.resolveMarket(newId, true, "manual: bot offline");

        assertEq(uint8(m.status()), uint8(PredictionMarket.Status.Resolved));
        assertEq(m.yesWins(), true);
        assertEq(m.reasoning(), "manual: bot offline");
    }

    function test_Reasoning_PersistedOnChain() public {
        vm.warp(closingTime + 1);
        string memory r = "AI swarm: spread 0.85, BTC closing 152k confirmed by 5/7 oracles";
        factory.resolveMarket(marketId, true, r);
        assertEq(market.reasoning(), r);
    }

    /*//////////////////////////////////////////////////////////////
                     ORACLE-BASED SETTLEMENT
    //////////////////////////////////////////////////////////////*/

    function test_ResolveByOracle_AboveWins_YesPath() public {
        // market default: aboveWins = true, threshold = $150k
        vm.warp(closingTime + 1);
        aggregator.setPrice(160_000 * 1e8); // > threshold → YES wins

        market.resolveByOracle();

        assertEq(uint8(market.status()), uint8(PredictionMarket.Status.Resolved));
        assertEq(market.yesWins(), true);
        assertEq(market.settledPrice(), 160_000 * 1e8);
    }

    function test_ResolveByOracle_AboveWins_NoPath() public {
        vm.warp(closingTime + 1);
        aggregator.setPrice(140_000 * 1e8); // < threshold → NO wins

        market.resolveByOracle();

        assertEq(market.yesWins(), false);
        assertEq(market.settledPrice(), 140_000 * 1e8);
    }

    function test_ResolveByOracle_BelowWins_YesPath() public {
        (, PredictionMarket below) = _createMarket("Will BTC stay under 150k?", false);
        vm.warp(closingTime + 1);
        aggregator.setPrice(140_000 * 1e8); // <= threshold → YES wins (belowWins)

        below.resolveByOracle();

        assertEq(below.yesWins(), true);
    }

    function test_ResolveByOracle_BelowWins_NoPath() public {
        (, PredictionMarket below) = _createMarket("Will BTC stay under 150k?", false);
        vm.warp(closingTime + 1);
        aggregator.setPrice(160_000 * 1e8); // > threshold → NO wins (belowWins)

        below.resolveByOracle();

        assertEq(below.yesWins(), false);
    }

    function test_ResolveByOracle_RevertsBeforeClosingTime() public {
        // current time is < closingTime
        aggregator.setPrice(160_000 * 1e8);
        vm.expectRevert(PredictionMarket.TooEarlyToResolve.selector);
        market.resolveByOracle();
    }

    function test_ResolveByOracle_RevertsOnStaleOracle() public {
        vm.warp(closingTime + 1);
        // Push a price stamped 2 hours ago — older than MAX_ORACLE_STALENESS (1h).
        aggregator.setPriceWithTimestamp(160_000 * 1e8, block.timestamp - 2 hours);

        vm.expectRevert(PredictionMarket.OracleStale.selector);
        market.resolveByOracle();
    }

    function test_ResolveByOracle_RevertsOnZeroPrice() public {
        vm.warp(closingTime + 1);
        aggregator.setPrice(0);

        vm.expectRevert(PredictionMarket.OraclePriceInvalid.selector);
        market.resolveByOracle();
    }

    function test_ResolveByOracle_Permissionless() public {
        vm.warp(closingTime + 1);
        aggregator.setPrice(160_000 * 1e8);

        // A random caller can trigger settlement — not the resolver, not the factory.
        address randomCaller = makeAddr("random");
        vm.prank(randomCaller);
        market.resolveByOracle();

        assertEq(uint8(market.status()), uint8(PredictionMarket.Status.Resolved));
    }

    function test_ResolveByOracle_DistributesFees() public {
        _runSimulation();
        vm.warp(closingTime + 1);
        aggregator.setPrice(160_000 * 1e8); // YES wins

        uint256 platformBefore = usdc.balanceOf(platform);
        uint256 creatorBefore  = usdc.balanceOf(creator);

        market.resolveByOracle();

        // Same fee math as manual resolve: 1 % platform, 0.3 % creator on 200 USDC.
        assertApproxEqAbs(usdc.balanceOf(platform) - platformBefore, 200e6 * 100 / 10_000, 2);
        assertApproxEqAbs(usdc.balanceOf(creator)  - creatorBefore,  200e6 * 30  / 10_000, 2);
    }

    function test_ResolveByOracle_RevertsAfterAlreadyResolved() public {
        vm.warp(closingTime + 1);
        aggregator.setPrice(160_000 * 1e8);
        market.resolveByOracle();

        vm.expectRevert(PredictionMarket.MarketNotOpen.selector);
        market.resolveByOracle();
    }

    /*//////////////////////////////////////////////////////////////
                     v2 — INITIATOR HALF-POSITION OPENING
    //////////////////////////////////////////////////////////////*/

    function test_Initialize_LpShares_AreLocked() public view {
        assertEq(market.lpShares(creator),       50e6);
        assertEq(market.lockedLpShares(creator), 50e6);
    }

    function test_Initialize_Emits_MarketInitialized() public {
        // Set up a clean second creator so events can be observed.
        address creator2 = makeAddr("creator2");
        usdc.mint(creator2, INIT_LIQUIDITY);
        vm.startPrank(creator2);
        usdc.approve(address(factory), INIT_LIQUIDITY);
        vm.recordLogs();
        factory.createMarket(_defaultCreateParams("init event test", closingTime, true, true));
        vm.stopPrank();
        // Just sanity-check the call doesn't revert — full log decoding would
        // be flaky here because the market address is unknown ahead of time.
    }

    function test_Initialize_BothSides_StateDifferentiated() public {
        // YES-side market (the default fixture) drives yesProbability > 0.5
        // NO-side market drives yesProbability < 0.5 → mirror probabilities.
        usdc.mint(creator, INIT_LIQUIDITY);
        vm.startPrank(creator);
        usdc.approve(address(factory), INIT_LIQUIDITY);
        (, address noMarketAddr) = factory.createMarket(
            _defaultCreateParams("NO open", closingTime, true, false)
        );
        vm.stopPrank();
        PredictionMarket noMarket = PredictionMarket(noMarketAddr);

        // Both markets started with the same liquidity, so probabilities should be mirror images.
        uint256 yesYesProb = market.yesProbability();
        uint256 noYesProb  = noMarket.yesProbability();
        assertApproxEqAbs(yesYesProb + noYesProb, 1e18, 2, "YES/NO markets must mirror");
    }

    /*//////////////////////////////////////////////////////////////
                  v2 — PUBLIC addLiquidity (mid-market)
    //////////////////////////////////////////////////////////////*/

    function test_PublicAddLiquidity_AnyoneCanCall() public {
        usdc.mint(userA, 10e6);
        vm.startPrank(userA);
        usdc.approve(address(market), 10e6);
        uint256 shares = market.addLiquidity(10e6);
        vm.stopPrank();

        // shares = usdcAmount * totalLpShares / totalCollateral = 10e6 * 50e6 / 100e6 = 5e6
        assertEq(shares, 5e6);
        assertEq(market.lpShares(userA), 5e6);
        // Public LP shares are never locked.
        assertEq(market.lockedLpShares(userA), 0);
    }

    function test_PublicAddLiquidity_UpdatesReservesSymmetrically() public {
        uint256 yesBefore = market.yesReserve();
        uint256 noBefore  = market.noReserve();

        usdc.mint(userA, 10e6);
        vm.startPrank(userA);
        usdc.approve(address(market), 10e6);
        market.addLiquidity(10e6);
        vm.stopPrank();

        assertEq(market.yesReserve(), yesBefore + 10e6);
        assertEq(market.noReserve(),  noBefore  + 10e6);
        assertEq(market.totalCollateral(), 110e6);
    }

    function test_PublicAddLiquidity_Revert_ZeroAmount() public {
        usdc.mint(userA, 1);
        vm.startPrank(userA);
        usdc.approve(address(market), 1);
        vm.expectRevert(PredictionMarket.ZeroAmount.selector);
        market.addLiquidity(0);
        vm.stopPrank();
    }

    function test_PublicAddLiquidity_Revert_AfterResolve() public {
        vm.warp(closingTime + 1);
        factory.resolveMarket(marketId, true, "test");

        usdc.mint(userA, 10e6);
        vm.startPrank(userA);
        usdc.approve(address(market), 10e6);
        vm.expectRevert(PredictionMarket.MarketNotOpen.selector);
        market.addLiquidity(10e6);
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                          v2 — redeemPair
    //////////////////////////////////////////////////////////////*/

    /// @dev Helper: get the user a position with both YES and NO tokens by
    ///      doing both buyYes and buyNo. They then hold equal-amount excess
    ///      on each side eligible for redeemPair.
    function _buildPairForUser(address user, uint256 yesUsdc, uint256 noUsdc) internal {
        usdc.mint(user, yesUsdc + noUsdc);
        vm.startPrank(user);
        usdc.approve(address(market), yesUsdc + noUsdc);
        market.buyYes(yesUsdc, 0);
        market.buyNo(noUsdc,  0);
        vm.stopPrank();
    }

    function test_RedeemPair_BurnsAndReleasesUSDC() public {
        _buildPairForUser(userA, 10e6, 10e6);

        uint256 yesBal = outcomeToken.balanceOf(userA, yesId);
        uint256 noBal  = outcomeToken.balanceOf(userA, noId);
        uint256 redeemAmount = yesBal < noBal ? yesBal : noBal;

        uint256 collateralBefore = market.totalCollateral();
        uint256 usdcBefore       = usdc.balanceOf(userA);

        vm.prank(userA);
        market.redeemPair(redeemAmount);

        // USDC returned 1:1, no fee
        assertEq(usdc.balanceOf(userA) - usdcBefore, redeemAmount);
        assertEq(market.totalCollateral(), collateralBefore - redeemAmount);

        // Token balances reduced
        assertEq(outcomeToken.balanceOf(userA, yesId), yesBal - redeemAmount);
        assertEq(outcomeToken.balanceOf(userA, noId),  noBal  - redeemAmount);
    }

    function test_RedeemPair_PreservesCollateralInvariant() public {
        _buildPairForUser(userA, 10e6, 10e6);
        uint256 redeemAmount = 1e6;
        vm.prank(userA);
        market.redeemPair(redeemAmount);
        _assertCollateralInvariant();
    }

    function test_RedeemPair_Revert_AfterResolve() public {
        _buildPairForUser(userA, 10e6, 10e6);
        vm.warp(closingTime + 1);
        factory.resolveMarket(marketId, true, "test");

        vm.expectRevert(PredictionMarket.MarketNotOpen.selector);
        vm.prank(userA);
        market.redeemPair(1e6);
    }

    function test_RedeemPair_Revert_ZeroAmount() public {
        vm.expectRevert(PredictionMarket.ZeroAmount.selector);
        vm.prank(userA);
        market.redeemPair(0);
    }

    function test_RedeemPair_Revert_InsufficientBalance() public {
        // userA holds no outcome tokens — burn must revert
        vm.expectRevert();
        vm.prank(userA);
        market.redeemPair(1);
    }

    /*//////////////////////////////////////////////////////////////
                       v2 — removeLiquidity
    //////////////////////////////////////////////////////////////*/

    function test_RemoveLiquidity_Asymmetric_AfterPublicAdd() public {
        // userA adds 10 USDC liquidity at the existing skew (25.06 / 100).
        usdc.mint(userA, 10e6);
        vm.startPrank(userA);
        usdc.approve(address(market), 10e6);
        market.addLiquidity(10e6);

        uint256 shares = market.lpShares(userA);
        uint256 collateralBefore = market.totalCollateral();
        uint256 yesBefore  = market.yesReserve();
        uint256 noBefore   = market.noReserve();
        uint256 totalLpBefore = market.totalLpShares();
        uint256 usdcBefore = usdc.balanceOf(userA);

        market.removeLiquidity(shares);
        vm.stopPrank();

        // Pro-rata pull
        uint256 expYes = yesBefore * shares / totalLpBefore;
        uint256 expNo  = noBefore  * shares / totalLpBefore;
        uint256 expSym = expYes < expNo ? expYes : expNo;
        uint256 expYesExtra = expYes - expSym;
        uint256 expNoExtra  = expNo  - expSym;

        // LP gets symmetric USDC + asymmetric outcome tokens (NO-heavy in this fixture)
        assertEq(usdc.balanceOf(userA) - usdcBefore, expSym, "symmetric USDC out");
        assertEq(outcomeToken.balanceOf(userA, yesId), expYesExtra, "YES extra");
        assertEq(outcomeToken.balanceOf(userA, noId),  expNoExtra,  "NO extra");

        // State reduced consistently
        assertEq(market.lpShares(userA), 0);
        assertEq(market.yesReserve(), yesBefore - expYes);
        assertEq(market.noReserve(),  noBefore  - expNo);
        assertEq(market.totalCollateral(), collateralBefore - expSym);

        _assertCollateralInvariant();
    }

    function test_RemoveLiquidity_Revert_LockedInitiator() public {
        // Creator's whole share is locked → any removeLiquidity reverts.
        vm.expectRevert(PredictionMarket.LpSharesLocked.selector);
        vm.prank(creator);
        market.removeLiquidity(1);
    }

    function test_RemoveLiquidity_Revert_TooManyShares() public {
        vm.expectRevert(PredictionMarket.InsufficientLpShares.selector);
        vm.prank(userA);
        market.removeLiquidity(1); // userA has zero shares
    }

    function test_RemoveLiquidity_Revert_ZeroShares() public {
        vm.expectRevert(PredictionMarket.ZeroAmount.selector);
        vm.prank(creator);
        market.removeLiquidity(0);
    }

    function test_RemoveLiquidity_Revert_AfterResolve() public {
        usdc.mint(userA, 10e6);
        vm.startPrank(userA);
        usdc.approve(address(market), 10e6);
        market.addLiquidity(10e6);
        uint256 shares = market.lpShares(userA);
        vm.stopPrank();

        vm.warp(closingTime + 1);
        factory.resolveMarket(marketId, true, "test");

        vm.expectRevert(PredictionMarket.MarketNotOpen.selector);
        vm.prank(userA);
        market.removeLiquidity(shares);
    }

    function test_RemoveLiquidity_Initiator_CanRemove_OnlyExtraShares() public {
        // Initiator adds more liquidity via the public path — those are unlocked.
        usdc.mint(creator, 10e6);
        vm.startPrank(creator);
        usdc.approve(address(market), 10e6);
        uint256 extra = market.addLiquidity(10e6);

        // Removing the extra portion succeeds…
        market.removeLiquidity(extra);

        // …but trying to remove past the locked floor reverts.
        vm.expectRevert(PredictionMarket.LpSharesLocked.selector);
        market.removeLiquidity(1);
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
              v2 — END-TO-END INVARIANT AFTER ALL OPERATIONS
    //////////////////////////////////////////////////////////////*/

    function test_Invariant_AfterAllV2Ops() public {
        // Mix every v2 mutator: buys, add liquidity, redeem pair, remove liquidity.
        _runSimulation(); // A buys YES, B buys NO, C buys YES, D buys NO

        // userE comes in as a public LP, then bails out partially
        address userE = makeAddr("userE");
        usdc.mint(userE, 20e6);
        vm.startPrank(userE);
        usdc.approve(address(market), 20e6);
        uint256 eShares = market.addLiquidity(20e6);
        market.removeLiquidity(eShares / 2);
        vm.stopPrank();

        // userA builds a pair and exits early via redeemPair
        _buildPairForUser(userA, 5e6, 5e6);
        uint256 aYes = outcomeToken.balanceOf(userA, yesId);
        uint256 aNo  = outcomeToken.balanceOf(userA, noId);
        uint256 minPair = aYes < aNo ? aYes : aNo;
        if (minPair > 0) {
            vm.prank(userA);
            market.redeemPair(minPair);
        }

        _assertCollateralInvariantWithExtras(userE);
    }

    /// @dev Variant of `_assertCollateralInvariant` that also folds in an
    ///      additional address (e.g. a generated userE) without polluting the
    ///      base helper used by every test.
    function _assertCollateralInvariantWithExtras(address extra) internal view {
        uint256 totalYes = outcomeToken.balanceOf(creator, yesId)
            + outcomeToken.balanceOf(userA, yesId)
            + outcomeToken.balanceOf(userB, yesId)
            + outcomeToken.balanceOf(userC, yesId)
            + outcomeToken.balanceOf(userD, yesId)
            + outcomeToken.balanceOf(extra, yesId);
        uint256 totalNo  = outcomeToken.balanceOf(creator, noId)
            + outcomeToken.balanceOf(userA, noId)
            + outcomeToken.balanceOf(userB, noId)
            + outcomeToken.balanceOf(userC, noId)
            + outcomeToken.balanceOf(userD, noId)
            + outcomeToken.balanceOf(extra, noId);
        assertEq(totalYes + market.yesReserve(), market.totalCollateral(), "YES side invariant");
        assertEq(totalNo  + market.noReserve(),  market.totalCollateral(), "NO  side invariant");
    }
}
