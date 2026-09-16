// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IEventMarket - Interface for admin-resolved YES/NO AMM event markets
/// @notice CPMM-based prediction market for binary off-chain events (e.g. sports
///         results) where resolution comes from an admin (no price oracle).
interface IEventMarket {
    enum Status {
        Open,    // Accepting bets and liquidity
        Locked,  // bettingDeadline reached: no swaps / no addLiquidity; removeLiquidity + redeemPair still allowed
        Settled  // Admin has resolved (or emergency draw fired)
    }

    struct MarketInfo {
        address creator;
        address platform;
        address admin;
        address token;
        string question;
        string resolutionSource;
        uint256 bettingDeadline;
        uint256 resolveAfter;
        Status status;
        bool yesWins;
        bool isDraw;
        uint256 yesReserve;
        uint256 noReserve;
        uint256 totalCollateral;
        uint256 totalLpShares;
        uint256 lpSwapFeeBps;
        uint256 platformFeeBps;
        uint256 creatorFeeBps;
        uint256 netUsdcPerYesToken;
        uint256 netUsdcPerNoToken;
    }

    /// @notice Cumulative, monotonic market statistics — everything the analytics
    ///         backend needs, maintained by the market itself so a poller can read
    ///         a market's whole history with one eth_call instead of replaying its
    ///         event log. Every field only ever grows (except the settlement fees,
    ///         which are written once at resolve), so the backend derives any
    ///         period's deltas by diffing two snapshots.
    /// @dev    Fields are packed (uint128 USDC amounts, uint32 counts) so the
    ///         bookkeeping costs a trade ~2 extra SSTOREs. uint128 holds 3.4e38 —
    ///         with 6-decimal USDC that is 3.4e32 USDC, far beyond any real total.
    struct Stats {
        // ── USDC flows (6 decimals, same unit as the collateral token) ──
        uint128 buyYesVolume; // USDC in via buyYes
        uint128 buyNoVolume; // USDC in via buyNo
        uint128 sellYesVolume; // USDC out via sellYes
        uint128 sellNoVolume; // USDC out via sellNo
        uint128 liquidityAdded; // USDC in via initializeMarket + addLiquidity
        uint128 liquidityRemoved; // USDC out via removeLiquidity (symmetric leg)
        uint128 pairRedeemVolume; // USDC out via redeemPair
        uint128 redeemPayout; // USDC out via redeemYes / redeemNo
        uint128 lpClaimPayout; // USDC out via claimLpPayout
        uint128 platformFee; // actual fee paid at resolve (0 until settled)
        uint128 creatorFee; // actual fee paid at resolve (0 until settled)
        // ── Counts ──
        uint32 buyYesCount;
        uint32 buyNoCount;
        uint32 sellYesCount;
        uint32 sellNoCount;
        uint32 liquidityAddedCount;
        uint32 liquidityRemovedCount;
        /// @dev Distinct addresses that ever bought or sold — cumulative, so a
        ///      diff of two snapshots yields NEW traders in that window, not
        ///      addresses active in it.
        uint32 uniqueTraders;
        uint32 uniqueLps; // distinct addresses that ever added liquidity
        uint32 pairRedeemCount;
        uint32 redeemCount;
        uint32 lpClaimCount;
    }

    /// @notice A single user's position in a market: outcome-token balances, LP shares,
    ///         and cumulative gross USDC flows for cost-basis / P&L / ROI.
    struct UserState {
        uint256 yesBalance;
        uint256 noBalance;
        uint256 lpShares;
        uint256 lockedLpShares;
        bool lpClaimed;
        uint256 usdcIn; // gross USDC deposited: buys + LP adds
        uint256 usdcOut; // gross USDC withdrawn: sells + LP removes + redeems + LP payout
    }

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event MarketInitialized(
        address indexed creator,
        uint256 lpUsdc,
        uint256 lockedShares
    );
    event LiquidityAdded(address indexed provider, uint256 usdcAmount, uint256 shares, bool locked);
    event LiquidityRemoved(
        address indexed provider,
        uint256 sharesBurned,
        uint256 usdcOut,
        uint256 yesOut,
        uint256 noOut
    );
    event BoughtYes(address indexed buyer, uint256 usdcIn, uint256 yesOut);
    event BoughtNo(address indexed buyer, uint256 usdcIn, uint256 noOut);
    event SoldYes(address indexed seller, uint256 yesIn, uint256 usdcOut);
    event SoldNo(address indexed seller, uint256 noIn, uint256 usdcOut);
    event PairRedeemed(address indexed user, uint256 amount);
    event Locked(uint256 timestamp);
    event Reopened(uint256 timestamp);
    event MetadataUpdated(string question, string resolutionSource);
    event ScheduleUpdated(uint256 bettingDeadline, uint256 resolveAfter);
    event Resolved(bool yesWins, uint256 platformFee, uint256 creatorFee, string reasoning);
    event EmergencyDraw(uint256 yesReserveSnap, uint256 noReserveSnap);
    event Redeemed(address indexed user, uint256 tokenAmount, uint256 usdcOut, bool isYes);
    event LpPayoutClaimed(address indexed lp, uint256 usdcOut);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    error OnlyFactory();
    error OnlyAdmin();
    error WrongStatus();
    error BettingClosed();
    error ResolveTooEarly();
    error AlreadyInitialized();
    error InsufficientOutput();
    error InsufficientLpShares();
    error LpSharesLocked();
    error AlreadyClaimed();
    error NotLP();
    error ZeroAmount();
    error ZeroReserves();
    error FeeTooHigh();
    error InvalidDeadline();
    error InvalidResolveTime();
    error InsufficientOutcomeBalance();
    error EmergencyTimelockNotExpired();
    error StatsOverflow();

    /*//////////////////////////////////////////////////////////////
                               FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function initializeMarket(address creator_, uint256 initLiquidity) external;

    function addLiquidity(uint256 usdcAmount) external returns (uint256 shares);
    function removeLiquidity(uint256 shares) external;

    function buyYes(uint256 usdcAmount, uint256 minYesOut) external returns (uint256 yesOut);
    function buyNo(uint256 usdcAmount, uint256 minNoOut) external returns (uint256 noOut);
    function sellYes(uint256 yesAmount, uint256 minUsdcOut) external returns (uint256 usdcOut);
    function sellNo(uint256 noAmount, uint256 minUsdcOut) external returns (uint256 usdcOut);
    function redeemPair(uint256 amount) external;

    function setMetadata(string calldata question_, string calldata resolutionSource_) external;
    function setSchedule(uint256 bettingDeadline_, uint256 resolveAfter_) external;

    function lock() external;
    function resolve(bool yesWins_, string calldata reasoning_) external;
    function emergencyForceDraw() external;

    function redeemYes(uint256 amount) external;
    function redeemNo(uint256 amount) external;
    function claimLpPayout() external;

    function quoteYes(uint256 usdcAmount) external view returns (uint256);
    function quoteNo(uint256 usdcAmount) external view returns (uint256);
    function quoteSellYes(uint256 yesAmount) external view returns (uint256);
    function quoteSellNo(uint256 noAmount) external view returns (uint256);
    function yesProbability() external view returns (uint256);
    function noProbability() external view returns (uint256);
    function getMarketInfo() external view returns (MarketInfo memory);
    function getUserState(address u) external view returns (MarketInfo memory, UserState memory);
    function getStats() external view returns (Stats memory);
    function getMarketState() external view returns (MarketInfo memory, Stats memory);
}
