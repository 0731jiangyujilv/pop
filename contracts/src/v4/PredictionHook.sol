// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {OutcomeTokenV4} from "./OutcomeTokenV4.sol";

/// @title PredictionHook — Uniswap V4 Hook-based Prediction Market
///
/// Architecture:
///   • One global contract (deployed once) manages all markets.
///   • Each market gets two ERC-20 tokens: YES and NO.
///   • The AMM pool is a YES/NO V4 pool — price of YES in NO = P(YES)/P(NO).
///   • Collateral: 1 USDC → 1 YES + 1 NO (mintPair), redeemable at 1:1 before resolution.
///   • After resolution: winning token redeems at netUsdcPerToken (1 - platform/creator fees).
///   • beforeSwap hook: blocks all swaps on a market after it resolves.
///
/// Hook address requirement (enforced in constructor via Hooks.validateHookPermissions):
///   Only BEFORE_SWAP_FLAG (bit 7) is set → address & 0x3FFF == 0x0080
///   Use DeployPredictionHook.s.sol (CREATE2 + salt mining) to find a valid address.
///
/// Fee encoding: lpSwapFeeBps (Basis Points) → V4 fee in pips = lpSwapFeeBps * 100
///   (1 BPS = 0.01% = 100 pips; V4 uses pips/1e6 denomination)
contract PredictionHook is IHooks, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    /*//////////////////////////////////////////////////////////////
                             CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint256 private constant BPS = 10_000;
    uint256 private constant MAX_SETTLEMENT_FEE_BPS = 500; // 5% combined cap

    // sqrtPriceX96 for a 1:1 YES/NO price (50% implied probability)
    uint160 private constant SQRT_PRICE_1_1 = 79228162514264337593543950336;

    /*//////////////////////////////////////////////////////////////
                             IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    IPoolManager public immutable poolManager;
    IERC20 public immutable usdc;
    address public immutable platform;

    /*//////////////////////////////////////////////////////////////
                              TYPES
    //////////////////////////////////////////////////////////////*/

    enum Status {
        Open,
        Resolved
    }

    struct Market {
        address yesToken;
        address noToken;
        PoolKey poolKey;
        address creator;
        address resolver;
        string question;
        uint256 closingTime;
        uint256 platformFeeBps;
        uint256 creatorFeeBps;
        uint256 totalCollateral;
        uint256 netUsdcPerToken; // 1e18-scaled; set at resolution
        bool yesWins;
        Status status;
    }

    /*//////////////////////////////////////////////////////////////
                               STATE
    //////////////////////////////////////////////////////////////*/

    uint256 public nextMarketId;
    mapping(uint256 => Market) private _markets;
    mapping(PoolId => uint256) public poolIdToMarketId;

    /*//////////////////////////////////////////////////////////////
                               ERRORS
    //////////////////////////////////////////////////////////////*/

    error NotPoolManager();
    error MarketNotOpen();
    error MarketNotResolved();
    error OnlyResolver();
    error FeeTooHigh();
    error TooEarlyToResolve();
    error AlreadyResolved();
    error ZeroAmount();
    error InsufficientBalance();

    /*//////////////////////////////////////////////////////////////
                               EVENTS
    //////////////////////////////////////////////////////////////*/

    event MarketCreated(uint256 indexed marketId, address yesToken, address noToken, PoolId poolId, string question);
    event PairMinted(uint256 indexed marketId, address indexed user, uint256 amount);
    event PairRedeemed(uint256 indexed marketId, address indexed user, uint256 amount);
    event Resolved(uint256 indexed marketId, bool yesWins, uint256 platformFee, uint256 creatorFee);
    event Redeemed(uint256 indexed marketId, address indexed user, uint256 tokenAmount, uint256 usdcOut);

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(IPoolManager _poolManager, IERC20 _usdc, address _platform) {
        poolManager = _poolManager;
        usdc = _usdc;
        platform = _platform;

        // Ensure this contract's address has EXACTLY the beforeSwap bit set (and no other hook bits).
        // This will revert in the constructor if the address was not mined correctly.
        Hooks.validateHookPermissions(
            IHooks(address(this)),
            Hooks.Permissions({
                beforeInitialize: false,
                afterInitialize: false,
                beforeAddLiquidity: false,
                afterAddLiquidity: false,
                beforeRemoveLiquidity: false,
                afterRemoveLiquidity: false,
                beforeSwap: true,
                afterSwap: false,
                beforeDonate: false,
                afterDonate: false,
                beforeSwapReturnDelta: false,
                afterSwapReturnDelta: false,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            })
        );
    }

    /*//////////////////////////////////////////////////////////////
                        MARKET CREATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Create a new prediction market with its own YES/NO V4 pool.
    /// @param question         Human-readable question being resolved.
    /// @param closingTime      Unix timestamp after which resolve() is allowed (0 = no restriction).
    /// @param resolver         Address authorised to call resolve().
    /// @param platformFeeBps   Settlement fee kept by the platform (≤ 5% combined with creator).
    /// @param creatorFeeBps    Settlement fee sent to the market creator.
    /// @param lpSwapFeeBps     LP swap fee in BPS; encoded as pips (×100) in the V4 pool key.
    /// @return marketId        Unique market identifier.
    /// @return yesToken        Address of the YES ERC-20 token.
    /// @return noToken         Address of the NO ERC-20 token.
    function createMarket(
        string calldata question,
        uint256 closingTime,
        address resolver,
        uint256 platformFeeBps,
        uint256 creatorFeeBps,
        uint256 lpSwapFeeBps
    ) external nonReentrant returns (uint256 marketId, address yesToken, address noToken) {
        if (platformFeeBps + creatorFeeBps > MAX_SETTLEMENT_FEE_BPS) revert FeeTooHigh();

        marketId = nextMarketId++;

        string memory mid = _uint2str(marketId);
        yesToken = address(new OutcomeTokenV4(string.concat("YES-", mid), string.concat("YES", mid), address(this)));
        noToken = address(new OutcomeTokenV4(string.concat("NO-", mid), string.concat("NO", mid), address(this)));

        // V4 requires currency0 < currency1 by address
        (address t0, address t1) = yesToken < noToken ? (yesToken, noToken) : (noToken, yesToken);

        // Tick spacing 10 gives fine-grained price resolution across the full [0,1] probability range.
        // V4 fee denominator is 1e6 (pips); BPS × 100 converts to pips.
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(t0),
            currency1: Currency.wrap(t1),
            fee: uint24(lpSwapFeeBps * 100),
            tickSpacing: 10,
            hooks: IHooks(address(this))
        });

        _markets[marketId] = Market({
            yesToken: yesToken,
            noToken: noToken,
            poolKey: key,
            creator: msg.sender,
            resolver: resolver,
            question: question,
            closingTime: closingTime,
            platformFeeBps: platformFeeBps,
            creatorFeeBps: creatorFeeBps,
            totalCollateral: 0,
            netUsdcPerToken: 0,
            yesWins: false,
            status: Status.Open
        });

        PoolId pid = key.toId();
        poolIdToMarketId[pid] = marketId;

        poolManager.initialize(key, SQRT_PRICE_1_1);

        emit MarketCreated(marketId, yesToken, noToken, pid, question);
    }

    /*//////////////////////////////////////////////////////////////
                        COLLATERAL — MINT/REDEEM
    //////////////////////////////////////////////////////////////*/

    /// @notice Deposit `usdcAmount` USDC and receive equal YES + NO tokens.
    function mintPair(uint256 marketId, uint256 usdcAmount) external nonReentrant {
        _requireOpen(marketId);
        if (usdcAmount == 0) revert ZeroAmount();
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        _mintPair(marketId, msg.sender, usdcAmount);
        emit PairMinted(marketId, msg.sender, usdcAmount);
    }

    /// @notice Deposit USDC and mint YES + NO to `to` (used by PredictionHookHelper).
    function mintPairTo(uint256 marketId, uint256 usdcAmount, address to) external nonReentrant {
        _requireOpen(marketId);
        if (usdcAmount == 0) revert ZeroAmount();
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        _mintPair(marketId, to, usdcAmount);
        emit PairMinted(marketId, to, usdcAmount);
    }

    /// @notice Burn equal YES + NO and receive USDC back (arbitrage / exit).
    function redeemPair(uint256 marketId, uint256 amount) external nonReentrant {
        _requireOpen(marketId);
        if (amount == 0) revert ZeroAmount();
        Market storage m = _markets[marketId];
        OutcomeTokenV4(m.yesToken).burn(msg.sender, amount);
        OutcomeTokenV4(m.noToken).burn(msg.sender, amount);
        m.totalCollateral -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit PairRedeemed(marketId, msg.sender, amount);
    }

    /*//////////////////////////////////////////////////////////////
                           SETTLEMENT
    //////////////////////////////////////////////////////////////*/

    /// @notice Resolve the market. Deducts platform and creator fees from collateral.
    /// @param marketId   Market to resolve.
    /// @param yesWins_   true = YES outcome wins, false = NO wins.
    function resolve(uint256 marketId, bool yesWins_) external {
        Market storage m = _markets[marketId];
        if (m.status == Status.Resolved) revert AlreadyResolved();
        if (msg.sender != m.resolver) revert OnlyResolver();
        if (m.closingTime != 0 && block.timestamp < m.closingTime) revert TooEarlyToResolve();

        m.yesWins = yesWins_;
        m.status = Status.Resolved;

        uint256 platformFee = m.totalCollateral * m.platformFeeBps / BPS;
        uint256 creatorFee = m.totalCollateral * m.creatorFeeBps / BPS;

        if (platformFee > 0) usdc.safeTransfer(platform, platformFee);
        if (creatorFee > 0) usdc.safeTransfer(m.creator, creatorFee);

        uint256 remaining = m.totalCollateral - platformFee - creatorFee;
        m.netUsdcPerToken = remaining * 1e18 / m.totalCollateral;

        emit Resolved(marketId, yesWins_, platformFee, creatorFee);
    }

    /// @notice Burn winning outcome tokens and receive USDC.
    function redeem(uint256 marketId, uint256 tokenAmount) external nonReentrant {
        Market storage m = _markets[marketId];
        if (m.status != Status.Resolved) revert MarketNotResolved();
        if (tokenAmount == 0) revert ZeroAmount();

        address winningToken = m.yesWins ? m.yesToken : m.noToken;
        OutcomeTokenV4(winningToken).burn(msg.sender, tokenAmount);

        uint256 usdcOut = tokenAmount * m.netUsdcPerToken / 1e18;
        usdc.safeTransfer(msg.sender, usdcOut);

        emit Redeemed(marketId, msg.sender, tokenAmount, usdcOut);
    }

    /*//////////////////////////////////////////////////////////////
                              VIEWS
    //////////////////////////////////////////////////////////////*/

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return _markets[marketId];
    }

    function getPoolKey(uint256 marketId) external view returns (PoolKey memory) {
        return _markets[marketId].poolKey;
    }

    /// @notice Returns (yesToken, noToken, totalCollateral) for a market.
    function getMarketTokens(uint256 marketId)
        external
        view
        returns (address yesToken, address noToken, uint256 totalCollateral)
    {
        Market storage m = _markets[marketId];
        return (m.yesToken, m.noToken, m.totalCollateral);
    }

    /*//////////////////////////////////////////////////////////////
                        IHooks IMPLEMENTATION
    //////////////////////////////////////////////////////////////*/

    /// @dev Revert any swap if the market has already been resolved.
    function beforeSwap(address, PoolKey calldata key, IPoolManager.SwapParams calldata, bytes calldata)
        external
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        uint256 marketId = poolIdToMarketId[key.toId()];
        if (_markets[marketId].status == Status.Resolved) revert MarketNotOpen();
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    // All other IHooks functions are not used — revert to catch misconfiguration.
    function beforeInitialize(address, PoolKey calldata, uint160) external pure override returns (bytes4) {
        revert();
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure override returns (bytes4) {
        revert();
    }

    function beforeAddLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure override returns (bytes4, BalanceDelta) {
        revert();
    }

    function beforeRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) external pure override returns (bytes4) {
        revert();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure override returns (bytes4, BalanceDelta) {
        revert();
    }

    function afterSwap(address, PoolKey calldata, IPoolManager.SwapParams calldata, BalanceDelta, bytes calldata)
        external
        pure
        override
        returns (bytes4, int128)
    {
        revert();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert();
    }

    /*//////////////////////////////////////////////////////////////
                            INTERNAL
    //////////////////////////////////////////////////////////////*/

    function _mintPair(uint256 marketId, address to, uint256 amount) internal {
        Market storage m = _markets[marketId];
        m.totalCollateral += amount;
        OutcomeTokenV4(m.yesToken).mint(to, amount);
        OutcomeTokenV4(m.noToken).mint(to, amount);
    }

    function _requireOpen(uint256 marketId) internal view {
        if (_markets[marketId].status != Status.Open) revert MarketNotOpen();
    }

    function _uint2str(uint256 n) internal pure returns (string memory) {
        if (n == 0) return "0";
        uint256 temp = n;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buf = new bytes(digits);
        while (n != 0) {
            digits--;
            buf[digits] = bytes1(uint8(48 + n % 10));
            n /= 10;
        }
        return string(buf);
    }
}
