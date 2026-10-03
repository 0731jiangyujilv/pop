// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IEventMarket} from "./interfaces/IEventMarket.sol";

/// @title EventMarket - YES/NO AMM prediction market for admin-resolved events
///
/// Design overview:
///   * 1 USDC deposited mints 1 YES + 1 NO (fully collateralised).
///   * One virtual CPMM pool (yesReserve * noReserve = k) sets price.
///   * Buy YES: mint pair, keep YES, swap the NO through the pool for extra YES.
///   * Pair redeem (1 YES + 1 NO -> 1 USDC) is always available pre-settle.
///   * LP swap fee accrues by pool growth (UniV2-style "fee on input").
///   * Settlement (manual by admin) deducts platform + creator fee from total
///     collateral; remaining is split among winning-side token holders + LPs
///     proportionally via netUsdcPerToken.
///   * The market keeps its own cumulative {Stats} (volumes, counts, unique
///     participants), so analytics is one eth_call rather than a replay of the
///     event log.
///
/// Three states:
///   Open    - betting open, AMM active, LP add/remove allowed
///   Locked  - bettingDeadline passed: no buy / no addLiquidity;
///             removeLiquidity + redeemPair still allowed
///   Settled - admin resolved or emergency draw fired
///
/// Invariants:
///   userYesBalance + yesReserve == totalCollateral
///   userNoBalance  + noReserve  == totalCollateral
///   (so total YES outstanding == total NO outstanding == totalCollateral)
contract EventMarket is IEventMarket, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                              CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint256 private constant BPS = 10_000;
    uint256 private constant ONE = 1e18;

    uint256 private constant MAX_LP_SWAP_FEE_BPS = 200; // 2%
    uint256 private constant MAX_PROTOCOL_FEE_BPS = 500; // 5% total

    /// @notice Anyone may trigger a draw resolution this long after resolveAfter
    ///         if the admin has not resolved. Protects users against admin
    ///         absence; never reachable in normal operation.
    uint256 public constant EMERGENCY_TIMELOCK = 24 hours;

    /// @notice Default gap between betting close and the earliest resolve time
    ///         when the creator (or admin) doesn't specify one explicitly.
    uint256 public constant DEFAULT_RESOLVE_WINDOW = 2 hours;

    /*//////////////////////////////////////////////////////////////
                              IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    IERC20 public immutable usdc;
    address public immutable factory;
    address public immutable admin;
    address public immutable creator;
    address public immutable platform;

    /// @notice Betting close and earliest resolve time. Mutable — the admin may
    ///         reschedule both via {setSchedule} any time before settlement.
    uint256 public bettingDeadline;
    uint256 public resolveAfter;

    uint256 public immutable lpSwapFeeBps;
    uint256 public immutable platformFeeBps;
    uint256 public immutable creatorFeeBps;

    /*//////////////////////////////////////////////////////////////
                            MUTABLE STATE
    //////////////////////////////////////////////////////////////*/

    string public question;
    string public resolutionSource;

    Status public status;
    bool public yesWins;
    bool public isDraw;
    string public reasoning;

    uint256 public yesReserve;
    uint256 public noReserve;
    uint256 public totalCollateral;

    mapping(address => uint256) public yesBalanceOf;
    mapping(address => uint256) public noBalanceOf;

    uint256 public totalLpShares;
    mapping(address => uint256) public lpShares;
    mapping(address => uint256) public lockedLpShares;
    mapping(address => bool) public lpClaimed;

    /// @notice Per-user cumulative USDC flows, so cost basis / P&L / ROI can be read
    ///         directly instead of reconstructed off-chain from event logs.
    ///         usdcInOf  = buys (buyYes/buyNo) + LP adds (addLiquidity / initial locked LP)
    ///         usdcOutOf = sells (sellYes/sellNo) + LP removes (symmetric USDC leg)
    ///                     + pair redeems + settle redeems + LP payout claims
    ///         Settlement platform/creator fees are intentionally NOT counted.
    mapping(address => uint256) public usdcInOf;
    mapping(address => uint256) public usdcOutOf;

    /// @notice USDC payable per winning YES, 1e18-scaled. In a normal resolve,
    ///         the losing side's value is 0. In an emergency draw both sides
    ///         pay the implied probability snapshot at draw time.
    uint256 public netUsdcPerYesToken;
    uint256 public netUsdcPerNoToken;

    /// @notice Cumulative market statistics, read via {getStats}. Maintained
    ///         inline so the analytics backend can poll one eth_call per market
    ///         instead of replaying the event log; see {IEventMarket.Stats}.
    Stats private _stats;

    /// @notice Bitmask of roles an address has ever held in this market, used to
    ///         keep {Stats.uniqueTraders} / {Stats.uniqueLps} exact. One cold
    ///         SSTORE per address the first time it trades or provides liquidity.
    mapping(address => uint8) public participantFlags;

    uint8 private constant FLAG_TRADER = 1;
    uint8 private constant FLAG_LP = 2;

    /*//////////////////////////////////////////////////////////////
                              MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier onlyFactory() {
        if (msg.sender != factory) revert OnlyFactory();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    struct Params {
        address usdc;
        address admin;
        address creator;
        address platform;
        string question;
        string resolutionSource;
        uint256 bettingDeadline;
        uint256 resolveAfter;
        uint256 lpSwapFeeBps;
        uint256 platformFeeBps;
        uint256 creatorFeeBps;
    }

    constructor(Params memory p) {
        if (p.lpSwapFeeBps > MAX_LP_SWAP_FEE_BPS) revert FeeTooHigh();
        if (p.platformFeeBps + p.creatorFeeBps > MAX_PROTOCOL_FEE_BPS) revert FeeTooHigh();
        if (p.bettingDeadline <= block.timestamp) revert InvalidDeadline();
        uint256 resolveAfter_ = p.resolveAfter == 0 ? p.bettingDeadline + DEFAULT_RESOLVE_WINDOW : p.resolveAfter;
        if (resolveAfter_ < p.bettingDeadline) revert InvalidResolveTime();

        usdc = IERC20(p.usdc);
        factory = msg.sender;
        admin = p.admin;
        creator = p.creator;
        platform = p.platform;
        question = p.question;
        resolutionSource = p.resolutionSource;
        bettingDeadline = p.bettingDeadline;
        resolveAfter = resolveAfter_;
        lpSwapFeeBps = p.lpSwapFeeBps;
        platformFeeBps = p.platformFeeBps;
        creatorFeeBps = p.creatorFeeBps;
        status = Status.Open;
    }

    /*//////////////////////////////////////////////////////////////
                          INITIATOR BOOTSTRAP
    //////////////////////////////////////////////////////////////*/

    /// @notice Factory-only single-call market bootstrap. All of `initLiquidity`
    ///         seeds the AMM pool as LOCKED Initiator LP. USDC must be in this
    ///         contract already; the factory transfers it before calling.
    function initializeMarket(address creator_, uint256 initLiquidity) external onlyFactory {
        if (status != Status.Open) revert WrongStatus();
        if (totalLpShares != 0) revert AlreadyInitialized();
        if (initLiquidity == 0) revert ZeroAmount();

        uint256 shares = _addLiquidity(creator_, initLiquidity, true);

        emit MarketInitialized(creator_, initLiquidity, shares);
    }

    /*//////////////////////////////////////////////////////////////
                              LIQUIDITY
    //////////////////////////////////////////////////////////////*/

    function addLiquidity(uint256 usdcAmount) external nonReentrant returns (uint256 shares) {
        _maybeLock();
        if (status != Status.Open) revert WrongStatus();
        if (totalLpShares == 0) revert ZeroReserves();

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        shares = _addLiquidity(msg.sender, usdcAmount, false);
    }

    /// @dev Symmetric injection: same USDC enters both reserves so implied
    ///      probability doesn't move. New LP's exposure is symmetric.
    function _addLiquidity(address provider, uint256 usdcAmount, bool lockShares) internal returns (uint256 shares) {
        if (usdcAmount == 0) revert ZeroAmount();

        if (totalLpShares == 0) {
            shares = usdcAmount;
            yesReserve = usdcAmount;
            noReserve = usdcAmount;
        } else {
            shares = usdcAmount * totalLpShares / totalCollateral;
            yesReserve += usdcAmount;
            noReserve += usdcAmount;
        }

        totalCollateral += usdcAmount;
        totalLpShares += shares;
        lpShares[provider] += shares;
        if (lockShares) lockedLpShares[provider] += shares;
        usdcInOf[provider] += usdcAmount;

        _stats.liquidityAdded += _u128(usdcAmount);
        _stats.liquidityAddedCount += 1;
        _markLp(provider);

        emit LiquidityAdded(provider, usdcAmount, shares, lockShares);
    }

    /// @notice Burn LP shares and walk away. Symmetric portion of the pro-rata
    ///         pool share comes back as USDC; the asymmetric remainder is paid
    ///         out as YES or NO so the LP can decide what to do with the
    ///         directional inventory.
    /// @dev    Allowed in Open and Locked; blocked after Settled (use
    ///         claimLpPayout instead). lockedLpShares cannot be touched here.
    function removeLiquidity(uint256 shares) external nonReentrant {
        _maybeLock();
        if (status == Status.Settled) revert WrongStatus();
        if (shares == 0) revert ZeroAmount();

        uint256 callerShares = lpShares[msg.sender];
        if (callerShares < shares) revert InsufficientLpShares();
        if (callerShares - shares < lockedLpShares[msg.sender]) revert LpSharesLocked();

        uint256 yesOut = yesReserve * shares / totalLpShares;
        uint256 noOut = noReserve * shares / totalLpShares;
        uint256 sym = yesOut < noOut ? yesOut : noOut;

        yesReserve -= yesOut;
        noReserve -= noOut;
        totalLpShares -= shares;
        lpShares[msg.sender] = callerShares - shares;
        totalCollateral -= sym;

        if (sym > 0) {
            usdcOutOf[msg.sender] += sym;
            usdc.safeTransfer(msg.sender, sym);
        }

        uint256 yesExtra = yesOut - sym;
        uint256 noExtra = noOut - sym;
        if (yesExtra > 0) yesBalanceOf[msg.sender] += yesExtra;
        if (noExtra > 0) noBalanceOf[msg.sender] += noExtra;

        // No _markLp here: shares are never transferable, so anyone holding them
        // was already counted when they added liquidity.
        _stats.liquidityRemoved += _u128(sym);
        _stats.liquidityRemovedCount += 1;

        emit LiquidityRemoved(msg.sender, shares, sym, yesExtra, noExtra);
    }

    /*//////////////////////////////////////////////////////////////
                                 BUY
    //////////////////////////////////////////////////////////////*/

    function buyYes(uint256 usdcAmount, uint256 minYesOut) external nonReentrant returns (uint256 yesOut) {
        _maybeLock();
        if (status != Status.Open) revert WrongStatus();

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        yesOut = _buyYes(msg.sender, usdcAmount);
        if (yesOut < minYesOut) revert InsufficientOutput();
        emit BoughtYes(msg.sender, usdcAmount, yesOut);
    }

    function buyNo(uint256 usdcAmount, uint256 minNoOut) external nonReentrant returns (uint256 noOut) {
        _maybeLock();
        if (status != Status.Open) revert WrongStatus();

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        noOut = _buyNo(msg.sender, usdcAmount);
        if (noOut < minNoOut) revert InsufficientOutput();
        emit BoughtNo(msg.sender, usdcAmount, noOut);
    }

    function _buyYes(address to, uint256 usdcAmount) internal returns (uint256 yesOut) {
        if (usdcAmount == 0) revert ZeroAmount();
        if (yesReserve == 0 || noReserve == 0) revert ZeroReserves();

        totalCollateral += usdcAmount;
        yesBalanceOf[to] += usdcAmount;
        usdcInOf[to] += usdcAmount;
        uint256 swappedYes = _swapNoForYes(usdcAmount);
        yesBalanceOf[to] += swappedYes;
        yesOut = usdcAmount + swappedYes;

        _stats.buyYesVolume += _u128(usdcAmount);
        _stats.buyYesCount += 1;
        _markTrader(to);
    }

    function _buyNo(address to, uint256 usdcAmount) internal returns (uint256 noOut) {
        if (usdcAmount == 0) revert ZeroAmount();
        if (yesReserve == 0 || noReserve == 0) revert ZeroReserves();

        totalCollateral += usdcAmount;
        noBalanceOf[to] += usdcAmount;
        usdcInOf[to] += usdcAmount;
        uint256 swappedNo = _swapYesForNo(usdcAmount);
        noBalanceOf[to] += swappedNo;
        noOut = usdcAmount + swappedNo;

        _stats.buyNoVolume += _u128(usdcAmount);
        _stats.buyNoCount += 1;
        _markTrader(to);
    }

    /*//////////////////////////////////////////////////////////////
                                 SELL
    //////////////////////////////////////////////////////////////*/

    /// @notice Sell YES tokens straight back to USDC in one call. The exact
    ///         reverse of buyYes: swap part of the YES through the pool for NO,
    ///         then pair-redeem the matched YES+NO into USDC. The swap+redeem
    ///         math is fused here so the caller only signs one transaction.
    function sellYes(uint256 yesAmount, uint256 minUsdcOut) external nonReentrant returns (uint256 usdcOut) {
        _maybeLock();
        if (status != Status.Open) revert WrongStatus();
        usdcOut = _sellYes(msg.sender, yesAmount);
        if (usdcOut < minUsdcOut) revert InsufficientOutput();
        emit SoldYes(msg.sender, yesAmount, usdcOut);
    }

    function sellNo(uint256 noAmount, uint256 minUsdcOut) external nonReentrant returns (uint256 usdcOut) {
        _maybeLock();
        if (status != Status.Open) revert WrongStatus();
        usdcOut = _sellNo(msg.sender, noAmount);
        if (usdcOut < minUsdcOut) revert InsufficientOutput();
        emit SoldNo(msg.sender, noAmount, usdcOut);
    }

    function _sellYes(address from, uint256 yesAmount) internal returns (uint256 usdcOut) {
        if (yesAmount == 0) revert ZeroAmount();
        if (yesReserve == 0 || noReserve == 0) revert ZeroReserves();
        if (yesBalanceOf[from] < yesAmount) revert InsufficientOutcomeBalance();

        // Swap `s` of the YES into the pool for NO so the remaining YES matches
        // the NO received; that matched pair burns 1:1 into USDC.
        uint256 s = _solveExitSwap(yesAmount, yesReserve, noReserve);
        uint256 noOut = _calcYesForNo(s, yesReserve, noReserve);
        yesReserve += s;
        noReserve -= noOut;

        uint256 yesLeft = yesAmount - s;
        uint256 pair = yesLeft < noOut ? yesLeft : noOut;

        // `s` goes to the pool, `pair` YES is burned against `pair` NO. Any NO
        // received beyond the matched pair stays with the user as dust.
        yesBalanceOf[from] -= (s + pair);
        if (noOut > pair) noBalanceOf[from] += (noOut - pair);
        totalCollateral -= pair;

        usdcOut = pair;
        if (usdcOut > 0) {
            usdcOutOf[from] += usdcOut;
            usdc.safeTransfer(from, usdcOut);
        }

        _stats.sellYesVolume += _u128(usdcOut);
        _stats.sellYesCount += 1;
        _markTrader(from);
    }

    function _sellNo(address from, uint256 noAmount) internal returns (uint256 usdcOut) {
        if (noAmount == 0) revert ZeroAmount();
        if (yesReserve == 0 || noReserve == 0) revert ZeroReserves();
        if (noBalanceOf[from] < noAmount) revert InsufficientOutcomeBalance();

        uint256 s = _solveExitSwap(noAmount, noReserve, yesReserve);
        uint256 yesOut = _calcNoForYes(s, yesReserve, noReserve);
        noReserve += s;
        yesReserve -= yesOut;

        uint256 noLeft = noAmount - s;
        uint256 pair = noLeft < yesOut ? noLeft : yesOut;

        noBalanceOf[from] -= (s + pair);
        if (yesOut > pair) yesBalanceOf[from] += (yesOut - pair);
        totalCollateral -= pair;

        usdcOut = pair;
        if (usdcOut > 0) {
            usdcOutOf[from] += usdcOut;
            usdc.safeTransfer(from, usdcOut);
        }

        _stats.sellNoVolume += _u128(usdcOut);
        _stats.sellNoCount += 1;
        _markTrader(from);
    }

    /*//////////////////////////////////////////////////////////////
                       EARLY EXIT (PAIR REDEEM)
    //////////////////////////////////////////////////////////////*/

    /// @notice Burn equal YES + NO and walk away with that many USDC.
    /// @dev    Allowed in Open and Locked (the user's #7 requirement).
    function redeemPair(uint256 amount) external nonReentrant {
        _maybeLock();
        if (status == Status.Settled) revert WrongStatus();
        if (amount == 0) revert ZeroAmount();

        uint256 yesBal = yesBalanceOf[msg.sender];
        uint256 noBal = noBalanceOf[msg.sender];
        if (yesBal < amount || noBal < amount) revert InsufficientOutcomeBalance();

        yesBalanceOf[msg.sender] = yesBal - amount;
        noBalanceOf[msg.sender] = noBal - amount;
        totalCollateral -= amount;
        usdcOutOf[msg.sender] += amount;

        _stats.pairRedeemVolume += _u128(amount);
        _stats.pairRedeemCount += 1;

        usdc.safeTransfer(msg.sender, amount);

        emit PairRedeemed(msg.sender, amount);
    }

    /*//////////////////////////////////////////////////////////////
                            LIFECYCLE / SETTLE
    //////////////////////////////////////////////////////////////*/

    /// @notice Admin may correct the market's question / resolution source until
    ///         it settles. Blocked once Settled so the resolved record is fixed.
    function setMetadata(string calldata question_, string calldata resolutionSource_) external onlyAdmin {
        if (status == Status.Settled) revert WrongStatus();
        question = question_;
        resolutionSource = resolutionSource_;
        emit MetadataUpdated(question_, resolutionSource_);
    }

    /// @notice Admin may reschedule betting close and the earliest resolve time
    ///         at any point before the market settles. Pass `resolveAfter_ == 0`
    ///         to default it to `bettingDeadline_ + DEFAULT_RESOLVE_WINDOW`.
    /// @dev    A locked market whose new deadline is in the future returns to
    ///         Open so betting/liquidity resume; it re-locks when the new
    ///         deadline passes. The new deadline must be strictly in the future.
    function setSchedule(uint256 bettingDeadline_, uint256 resolveAfter_) external onlyAdmin {
        if (status == Status.Settled) revert WrongStatus();
        if (bettingDeadline_ <= block.timestamp) revert InvalidDeadline();

        uint256 ra = resolveAfter_ == 0 ? bettingDeadline_ + DEFAULT_RESOLVE_WINDOW : resolveAfter_;
        if (ra < bettingDeadline_) revert InvalidResolveTime();

        bettingDeadline = bettingDeadline_;
        resolveAfter = ra;

        if (status == Status.Locked) {
            status = Status.Open;
            emit Reopened(block.timestamp);
        }

        emit ScheduleUpdated(bettingDeadline_, ra);
    }

    /// @notice Permissionless lock once bettingDeadline has passed. Idempotent.
    function lock() external {
        _maybeLock();
    }

    function _maybeLock() internal {
        if (status == Status.Open && block.timestamp >= bettingDeadline) {
            status = Status.Locked;
            emit Locked(block.timestamp);
        }
    }

    function resolve(bool yesWins_, string calldata reasoning_) external nonReentrant onlyAdmin {
        _maybeLock();
        if (status != Status.Locked) revert WrongStatus();
        if (block.timestamp < resolveAfter) revert ResolveTooEarly();

        yesWins = yesWins_;
        reasoning = reasoning_;
        status = Status.Settled;

        uint256 platformFee = totalCollateral * platformFeeBps / BPS;
        uint256 creatorFee = totalCollateral * creatorFeeBps / BPS;

        // Record the fees actually charged. An emergency draw takes none, so the
        // stats stay zero on that path — matching what the Resolved event says.
        _stats.platformFee = _u128(platformFee);
        _stats.creatorFee = _u128(creatorFee);

        if (platformFee > 0) usdc.safeTransfer(platform, platformFee);
        if (creatorFee > 0) usdc.safeTransfer(creator, creatorFee);

        uint256 remaining = totalCollateral - platformFee - creatorFee;
        uint256 netPerWinning = totalCollateral == 0 ? 0 : remaining * ONE / totalCollateral;

        if (yesWins_) {
            netUsdcPerYesToken = netPerWinning;
            netUsdcPerNoToken = 0;
        } else {
            netUsdcPerYesToken = 0;
            netUsdcPerNoToken = netPerWinning;
        }

        emit Resolved(yesWins_, platformFee, creatorFee, reasoning_);
    }

    /// @notice Anyone can force a draw resolution if the admin has not resolved
    ///         within EMERGENCY_TIMELOCK after resolveAfter. Each YES and NO
    ///         redeems at the implied probability from current reserves; no
    ///         protocol fee is taken in this path.
    function emergencyForceDraw() external nonReentrant {
        _maybeLock();
        if (status != Status.Locked) revert WrongStatus();
        if (block.timestamp < resolveAfter + EMERGENCY_TIMELOCK) revert EmergencyTimelockNotExpired();

        isDraw = true;
        status = Status.Settled;

        uint256 total = yesReserve + noReserve;
        if (total == 0) {
            netUsdcPerYesToken = ONE / 2;
            netUsdcPerNoToken = ONE - netUsdcPerYesToken;
        } else {
            // YES is worth more when NO reserve is larger: pYes = noReserve / total
            netUsdcPerYesToken = noReserve * ONE / total;
            netUsdcPerNoToken = ONE - netUsdcPerYesToken;
        }

        emit EmergencyDraw(yesReserve, noReserve);
    }

    /*//////////////////////////////////////////////////////////////
                          POST-SETTLE REDEEM
    //////////////////////////////////////////////////////////////*/

    function redeemYes(uint256 amount) external nonReentrant {
        _redeem(msg.sender, amount, true);
    }

    function redeemNo(uint256 amount) external nonReentrant {
        _redeem(msg.sender, amount, false);
    }

    function _redeem(address player, uint256 amount, bool isYes) internal {
        if (status != Status.Settled) revert WrongStatus();
        if (amount == 0) revert ZeroAmount();

        uint256 rate = isYes ? netUsdcPerYesToken : netUsdcPerNoToken;
        if (rate == 0) revert ZeroAmount();

        if (isYes) {
            uint256 bal = yesBalanceOf[player];
            if (bal < amount) revert InsufficientOutcomeBalance();
            yesBalanceOf[player] = bal - amount;
        } else {
            uint256 bal = noBalanceOf[player];
            if (bal < amount) revert InsufficientOutcomeBalance();
            noBalanceOf[player] = bal - amount;
        }

        uint256 usdcOut = amount * rate / ONE;
        if (usdcOut > 0) {
            usdcOutOf[player] += usdcOut;
            usdc.safeTransfer(player, usdcOut);
        }

        _stats.redeemPayout += _u128(usdcOut);
        _stats.redeemCount += 1;

        emit Redeemed(player, amount, usdcOut, isYes);
    }

    /// @notice LPs claim their pro-rata share of pool reserves at settle prices.
    ///         Each LP can claim once. Releases the Initiator's locked LP.
    function claimLpPayout() external nonReentrant {
        if (status != Status.Settled) revert WrongStatus();
        if (lpClaimed[msg.sender]) revert AlreadyClaimed();

        uint256 shares = lpShares[msg.sender];
        if (shares == 0) revert NotLP();

        lpClaimed[msg.sender] = true;

        uint256 yesShare = yesReserve * shares / totalLpShares;
        uint256 noShare = noReserve * shares / totalLpShares;

        uint256 usdcOut = yesShare * netUsdcPerYesToken / ONE + noShare * netUsdcPerNoToken / ONE;
        if (usdcOut > 0) {
            usdcOutOf[msg.sender] += usdcOut;
            usdc.safeTransfer(msg.sender, usdcOut);
        }

        _stats.lpClaimPayout += _u128(usdcOut);
        _stats.lpClaimCount += 1;

        emit LpPayoutClaimed(msg.sender, usdcOut);
    }

    /*//////////////////////////////////////////////////////////////
                                VIEWS
    //////////////////////////////////////////////////////////////*/

    function quoteYes(uint256 usdcAmount) external view returns (uint256) {
        return usdcAmount + _calcNoForYes(usdcAmount, yesReserve, noReserve);
    }

    function quoteNo(uint256 usdcAmount) external view returns (uint256) {
        return usdcAmount + _calcYesForNo(usdcAmount, yesReserve, noReserve);
    }

    /// @notice USDC received for selling `yesAmount` YES via sellYes().
    function quoteSellYes(uint256 yesAmount) external view returns (uint256) {
        if (yesAmount == 0 || yesReserve == 0 || noReserve == 0) return 0;
        uint256 s = _solveExitSwap(yesAmount, yesReserve, noReserve);
        uint256 noOut = _calcYesForNo(s, yesReserve, noReserve);
        uint256 yesLeft = yesAmount - s;
        return yesLeft < noOut ? yesLeft : noOut;
    }

    /// @notice USDC received for selling `noAmount` NO via sellNo().
    function quoteSellNo(uint256 noAmount) external view returns (uint256) {
        if (noAmount == 0 || yesReserve == 0 || noReserve == 0) return 0;
        uint256 s = _solveExitSwap(noAmount, noReserve, yesReserve);
        uint256 yesOut = _calcNoForYes(s, yesReserve, noReserve);
        uint256 noLeft = noAmount - s;
        return noLeft < yesOut ? noLeft : yesOut;
    }

    function yesProbability() external view returns (uint256) {
        uint256 total = yesReserve + noReserve;
        if (total == 0) return ONE / 2;
        return noReserve * ONE / total;
    }

    function noProbability() external view returns (uint256) {
        uint256 total = yesReserve + noReserve;
        if (total == 0) return ONE / 2;
        return yesReserve * ONE / total;
    }

    function getMarketInfo() external view returns (MarketInfo memory info) {
        return _marketInfo();
    }

    /// @notice Cumulative volumes, counts and unique-participant totals. Monotonic,
    ///         so an off-chain poller derives any period's activity by diffing two
    ///         readings instead of replaying logs.
    function getStats() external view returns (Stats memory) {
        return _stats;
    }

    /// @notice Live state + cumulative stats in one call — the single read the
    ///         analytics poller makes per market per interval.
    function getMarketState() external view returns (MarketInfo memory info, Stats memory stats) {
        info = _marketInfo();
        stats = _stats;
    }

    /// @notice Market state + a user's balances + cumulative USDC flows in one call, so
    ///         the backend can compute value / invested / P&L / ROI from a single eth_call
    ///         with no historical event scanning.
    function getUserState(address u) external view returns (MarketInfo memory info, UserState memory pos) {
        info = _marketInfo();
        pos = UserState({
            yesBalance: yesBalanceOf[u],
            noBalance: noBalanceOf[u],
            lpShares: lpShares[u],
            lockedLpShares: lockedLpShares[u],
            lpClaimed: lpClaimed[u],
            usdcIn: usdcInOf[u],
            usdcOut: usdcOutOf[u]
        });
    }

    function _marketInfo() internal view returns (MarketInfo memory info) {
        info.creator = creator;
        info.platform = platform;
        info.admin = admin;
        info.token = address(usdc);
        info.question = question;
        info.resolutionSource = resolutionSource;
        info.bettingDeadline = bettingDeadline;
        info.resolveAfter = resolveAfter;
        info.status = status;
        info.yesWins = yesWins;
        info.isDraw = isDraw;
        info.yesReserve = yesReserve;
        info.noReserve = noReserve;
        info.totalCollateral = totalCollateral;
        info.totalLpShares = totalLpShares;
        info.lpSwapFeeBps = lpSwapFeeBps;
        info.platformFeeBps = platformFeeBps;
        info.creatorFeeBps = creatorFeeBps;
        info.netUsdcPerYesToken = netUsdcPerYesToken;
        info.netUsdcPerNoToken = netUsdcPerNoToken;
    }

    /*//////////////////////////////////////////////////////////////
                             INTERNAL STATS
    //////////////////////////////////////////////////////////////*/

    /// @dev Narrowing cast for the packed counters. uint128 holds 3.4e32 USDC at
    ///      6 decimals, so this can never trip in practice — it exists so a
    ///      truncated cast can never silently corrupt the statistics.
    function _u128(uint256 v) private pure returns (uint128) {
        if (v > type(uint128).max) revert StatsOverflow();
        return uint128(v);
    }

    function _markTrader(address account) private {
        uint8 flags = participantFlags[account];
        if (flags & FLAG_TRADER == 0) {
            participantFlags[account] = flags | FLAG_TRADER;
            _stats.uniqueTraders += 1;
        }
    }

    function _markLp(address account) private {
        uint8 flags = participantFlags[account];
        if (flags & FLAG_LP == 0) {
            participantFlags[account] = flags | FLAG_LP;
            _stats.uniqueLps += 1;
        }
    }

    /*//////////////////////////////////////////////////////////////
                              INTERNAL AMM
    //////////////////////////////////////////////////////////////*/

    function _swapNoForYes(uint256 noIn) internal returns (uint256 yesOut) {
        yesOut = _calcNoForYes(noIn, yesReserve, noReserve);
        yesReserve -= yesOut;
        noReserve += noIn;
    }

    function _swapYesForNo(uint256 yesIn) internal returns (uint256 noOut) {
        noOut = _calcYesForNo(yesIn, yesReserve, noReserve);
        noReserve -= noOut;
        yesReserve += yesIn;
    }

    /// @dev x*y=k with input-side fee. Full `noIn` enters the reserve; only
    ///      `effectiveIn = noIn * (BPS - lpSwapFeeBps) / BPS` is used for the
    ///      output calc, so k grows by exactly the fee and LPs accrue value.
    function _calcNoForYes(uint256 noIn, uint256 yesRes, uint256 noRes) internal view returns (uint256) {
        if (yesRes == 0 || noRes == 0) return 0;
        uint256 effectiveIn = noIn * (BPS - lpSwapFeeBps) / BPS;
        return yesRes * effectiveIn / (noRes + effectiveIn);
    }

    function _calcYesForNo(uint256 yesIn, uint256 yesRes, uint256 noRes) internal view returns (uint256) {
        if (yesRes == 0 || noRes == 0) return 0;
        uint256 effectiveIn = yesIn * (BPS - lpSwapFeeBps) / BPS;
        return noRes * effectiveIn / (yesRes + effectiveIn);
    }

    /// @dev Solve for the amount `s` of the sold side to route through the pool
    ///      so that the leftover sold-side balance equals the opposite-side
    ///      tokens received — i.e. they form a redeemable pair. `reserveIn` is
    ///      the reserve of the side being sold (it grows by `s`), `reserveOut`
    ///      the opposite reserve (it shrinks by the swap output).
    ///
    ///      With fee fraction f = (BPS - fee)/BPS, the matched-pair condition
    ///      `amount - s == reserveOut * f*s / (reserveIn + f*s)` rearranges to
    ///      the quadratic (φ = BPS - fee):
    ///          φ·s² + (reserveIn·BPS + reserveOut·φ − amount·φ)·s
    ///                 − amount·reserveIn·BPS = 0
    ///      and `s` is its positive root.
    function _solveExitSwap(uint256 amount, uint256 reserveIn, uint256 reserveOut) internal view returns (uint256 s) {
        uint256 phi = BPS - lpSwapFeeBps;
        uint256 ab = reserveIn * BPS + reserveOut * phi; // the linear coefficient's positive part
        uint256 c = amount * phi;
        uint256 C = amount * reserveIn * BPS; // the constant term magnitude (4·φ·C under the root)
        uint256 fourPhiC = 4 * phi * C;

        if (ab >= c) {
            uint256 b = ab - c;
            s = (Math.sqrt(b * b + fourPhiC) - b) / (2 * phi);
        } else {
            uint256 b = c - ab;
            s = (Math.sqrt(b * b + fourPhiC) + b) / (2 * phi);
        }
        if (s > amount) s = amount;
    }
}
