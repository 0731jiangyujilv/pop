// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IEventMarketV2} from "./interfaces/IEventMarketV2.sol";

/// @title EventMarketV2 - EventMarket + OddsShift window-based LP protection
///
/// This is a standalone copy of {EventMarket} with the OddsShift mechanism
/// grafted on. V1 is deliberately left untouched — it has live markets.
///
/// The AMM half is unchanged from V1:
///   * 1 USDC deposited mints 1 YES + 1 NO (fully collateralised).
///   * One virtual CPMM pool (yesReserve * noReserve = k) sets price.
///   * Pair redeem (1 YES + 1 NO -> 1 USDC) is always available pre-settle.
///   * Settlement (manual by admin) deducts platform + creator fee from total
///     collateral; the remainder is split among winning-side holders + LPs.
///
/// The OddsShift half (see `oddsshift_todos.md`):
///   * Every buy and every sell pays a flat 1%: `baseFeeBps` (0.30%) straight to
///     LPs, `protectionFeeBps` (0.70%) into escrow. No size filter, no whitelist
///     — a filter would just invite order splitting. Deploy with
///     `lpSwapFeeBps = 0` so that 1% is the whole cost of trading.
///   * Escrow is real USDC sitting here but is NOT collateral and NOT in the
///     reserves, so `k`, the implied probability and the redemption math are
///     untouched by money whose owner is still undecided. Both V1 invariants
///     therefore still hold exactly.
///   * The unit of judgement is a WINDOW, not a trade. After every trade the
///     market measures the net probability displacement of the last `lookback`
///     trades; `jumpThreshold` or more marks a {Shock} over exactly those trades.
///   * The next `observeWindow` trades decide it. Back inside the threshold at
///     any point -> REVERTED -> every trade in the window is refunded its 0.70%
///     (net cost 0.30%). Still displaced when the observation window runs out ->
///     TOXIC -> the trades that pushed the probability in the shock's own
///     direction by more than `contribThreshold` forfeit their 0.70% to LPs (net
///     cost 1.00%). Correctors and small same-direction trades are refunded.
///   * A trade that slides out of the lookback window without ever being marked
///     is refunded. {resolveStale} is the permissionless time fallback that
///     judges the queue in a market that has gone quiet.
///
/// Invariants:
///   userYesBalance + yesReserve == totalCollateral
///   userNoBalance  + noReserve  == totalCollateral
///   usdc.balanceOf(this) >= totalCollateral
///                         + pendingEscrow + totalRebateOwed + totalLpRewardOwed
contract EventMarketV2 is IEventMarketV2, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                              CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint256 private constant BPS = 10_000;
    uint256 private constant ONE = 1e18;

    /// @dev Fixed-point scale for the OddsShift probability arithmetic.
    ///      500_000 == 50%. Deliberately narrower than {ONE} so a probability
    ///      fits in a uint64 and a Trade packs into two slots.
    uint256 internal constant PROB_ONE = 1e6;

    uint256 private constant ACC_PRECISION = 1e18;

    uint256 private constant MAX_LP_SWAP_FEE_BPS = 200; // 2%
    uint256 private constant MAX_PROTOCOL_FEE_BPS = 500; // 5% total
    uint256 private constant MAX_TRADE_FEE_BPS = 1_000; // 10% base + protection
    /// @dev Also bounds the settlement flush loop: at most
    ///      `lookback + observeWindow` trades can ever be awaiting a verdict.
    uint256 private constant MAX_WINDOW_SIZE = 100;

    /// @notice Anyone may trigger a draw resolution this long after resolveAfter
    ///         if the admin has not resolved.
    uint256 public constant EMERGENCY_TIMELOCK = 24 hours;

    /// @notice Default gap between betting close and the earliest resolve time.
    uint256 public constant DEFAULT_RESOLVE_WINDOW = 2 hours;

    /*//////////////////////////////////////////////////////////////
                              IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    IERC20 public immutable usdc;
    address public immutable factory;
    address public immutable admin;
    address public immutable creator;
    address public immutable platform;

    uint256 public bettingDeadline;
    uint256 public resolveAfter;

    uint256 public immutable lpSwapFeeBps;
    uint256 public immutable platformFeeBps;
    uint256 public immutable creatorFeeBps;

    // ── OddsShift ──

    /// @notice Charged on every trade and paid to LPs immediately. Never refunded.
    uint16 public immutable baseFeeBps;
    /// @notice Charged on every trade and escrowed until a verdict.
    uint16 public immutable protectionFeeBps;
    /// @notice Net displacement over `lookback` trades that marks a shock.
    uint32 public immutable jumpThreshold;
    /// @notice Own displacement above which a trade inside a toxic window pays.
    uint32 public immutable contribThreshold;
    /// @notice Trades per detection window.
    uint32 public immutable lookback;
    /// @notice Trades a marked shock gets to revert before it turns toxic.
    uint32 public immutable observeWindow;
    /// @notice Seconds of quiet after the last trade before {resolveStale} works.
    uint32 public immutable cooldown;

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

    /// @notice Per-user cumulative USDC flows. Both fee slices count as `in` on a
    ///         buy (the trader really did pay them) and a claimed rebate counts as
    ///         `out`, so P&L still nets correctly across the escrow lifecycle.
    mapping(address => uint256) public usdcInOf;
    mapping(address => uint256) public usdcOutOf;

    uint256 public netUsdcPerYesToken;
    uint256 public netUsdcPerNoToken;

    Stats private _stats;

    mapping(address => uint8) private participantFlags;

    uint8 private constant FLAG_TRADER = 1;
    uint8 private constant FLAG_LP = 2;

    // ── OddsShift state ──

    /// @dev Every trade, in execution order — the probability history the windows
    ///      are measured over. Verdicts are recorded in place. Read through
    ///      {getTrades}: the auto-generated element getter costs bytecode this
    ///      contract does not have (EIP-170) and returns one trade per call.
    Trade[] private trades;

    /// @dev Every detected jump. At most the last one can be open. See
    ///      {getShocks}.
    Shock[] private shocks;

    /// @notice First trade without a verdict. Trades are finalised strictly in
    ///         order, so this alone separates judged from pending.
    uint32 public nextToResolve;

    /// @notice True while `shocks[shocks.length - 1]` is inside its observation
    ///         window. No new shock is marked and no trade is judged until it
    ///         closes — the current dislocation is already being watched, and
    ///         overlapping windows would judge the same trade twice.
    bool public shockOpen;

    /// @dev Read through {getUserOddsShift}, which returns the trades themselves.
    mapping(address => uint256[]) private tradeIdsOf;

    uint256 public pendingEscrow;

    mapping(address => uint256) public rebateClaimable;
    uint256 public totalRebateOwed;

    /// @notice MasterChef-style accumulator: cumulative LP-bound USDC per share.
    ///         Carries both the base fee and forfeited protection fees.
    uint256 public accLpRewardPerShare;
    mapping(address => uint256) private lpRewardDebt;
    mapping(address => uint256) private lpRewardPending;
    uint256 public totalLpRewardOwed;

    // Lifetime totals, for the UI. Monotonic. Read through {getOddsShiftInfo}.
    uint256 internal cumBaseFee;
    uint256 internal cumChargedFee;
    uint256 internal cumRebated;

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
        // OddsShift
        uint16 baseFeeBps;
        uint16 protectionFeeBps;
        uint32 jumpThreshold;
        uint32 contribThreshold;
        uint32 lookback;
        uint32 observeWindow;
        uint32 cooldown;
    }

    constructor(Params memory p) {
        if (p.lpSwapFeeBps > MAX_LP_SWAP_FEE_BPS) revert FeeTooHigh();
        if (p.platformFeeBps + p.creatorFeeBps > MAX_PROTOCOL_FEE_BPS) revert FeeTooHigh();
        if (p.bettingDeadline <= block.timestamp) revert InvalidDeadline();
        uint256 resolveAfter_ =
            p.resolveAfter == 0 ? p.bettingDeadline + DEFAULT_RESOLVE_WINDOW : p.resolveAfter;
        if (resolveAfter_ < p.bettingDeadline) revert InvalidResolveTime();

        // A zero protection fee would leave nothing to judge.
        if (p.protectionFeeBps == 0) revert InvalidOddsShiftParams();
        if (uint256(p.baseFeeBps) + p.protectionFeeBps > MAX_TRADE_FEE_BPS) {
            revert InvalidOddsShiftParams();
        }
        if (p.jumpThreshold == 0 || p.jumpThreshold >= PROB_ONE) {
            revert InvalidOddsShiftParams();
        }
        // A contribution threshold above the jump threshold could never be met by
        // a window that only just tripped, so a toxic window would go unpunished.
        if (p.contribThreshold == 0 || p.contribThreshold > p.jumpThreshold) {
            revert InvalidOddsShiftParams();
        }
        // A 1-trade lookback would measure nothing but the trade's own impact,
        // which `contribThreshold` already covers.
        if (p.lookback < 2 || p.lookback > MAX_WINDOW_SIZE) revert InvalidOddsShiftParams();
        if (p.observeWindow == 0 || p.observeWindow > MAX_WINDOW_SIZE) {
            revert InvalidOddsShiftParams();
        }
        if (p.cooldown == 0) revert InvalidOddsShiftParams();

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

        baseFeeBps = p.baseFeeBps;
        protectionFeeBps = p.protectionFeeBps;
        jumpThreshold = p.jumpThreshold;
        contribThreshold = p.contribThreshold;
        lookback = p.lookback;
        observeWindow = p.observeWindow;
        cooldown = p.cooldown;

        status = Status.Open;
    }

    /*//////////////////////////////////////////////////////////////
                          INITIATOR BOOTSTRAP
    //////////////////////////////////////////////////////////////*/

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

    /// @dev Symmetric injection: the same USDC enters both reserves. No trade fee
    ///      is charged — liquidity provision is not directional flow.
    function _addLiquidity(address provider, uint256 usdcAmount, bool lockShares)
        internal
        returns (uint256 shares)
    {
        if (usdcAmount == 0) revert ZeroAmount();

        _harvest(provider);

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

        _syncDebt(provider);

        _stats.liquidityAdded += _u128(usdcAmount);
        _stats.liquidityAddedCount += 1;
        _markLp(provider);

        emit LiquidityAdded(provider, usdcAmount, shares, lockShares);
    }

    function removeLiquidity(uint256 shares) external nonReentrant {
        _maybeLock();
        if (status == Status.Settled) revert WrongStatus();
        if (shares == 0) revert ZeroAmount();

        uint256 callerShares = lpShares[msg.sender];
        if (callerShares < shares) revert InsufficientLpShares();
        if (callerShares - shares < lockedLpShares[msg.sender]) revert LpSharesLocked();

        _harvest(msg.sender);

        uint256 yesOut = yesReserve * shares / totalLpShares;
        uint256 noOut = noReserve * shares / totalLpShares;
        uint256 sym = yesOut < noOut ? yesOut : noOut;

        yesReserve -= yesOut;
        noReserve -= noOut;
        totalLpShares -= shares;
        lpShares[msg.sender] = callerShares - shares;
        totalCollateral -= sym;

        _syncDebt(msg.sender);

        if (sym > 0) {
            usdcOutOf[msg.sender] += sym;
            usdc.safeTransfer(msg.sender, sym);
        }

        uint256 yesExtra = yesOut - sym;
        uint256 noExtra = noOut - sym;
        if (yesExtra > 0) yesBalanceOf[msg.sender] += yesExtra;
        if (noExtra > 0) noBalanceOf[msg.sender] += noExtra;

        _stats.liquidityRemoved += _u128(sym);
        _stats.liquidityRemovedCount += 1;

        emit LiquidityRemoved(msg.sender, shares, sym, yesExtra, noExtra);
    }

    /*//////////////////////////////////////////////////////////////
                                 BUY
    //////////////////////////////////////////////////////////////*/

    /// @notice Buy YES. `usdcAmount` is the TOTAL pulled from the caller; the
    ///         base fee and the protection fee come off the top and the rest
    ///         enters the curve. Use {quoteYes} for the resulting token amount.
    function buyYes(uint256 usdcAmount, uint256 minYesOut)
        external
        nonReentrant
        returns (uint256 yesOut)
    {
        _maybeLock();
        if (status != Status.Open) revert WrongStatus();
        if (usdcAmount == 0) revert ZeroAmount();

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        (uint256 baseFee, uint256 escrow) = _splitFee(usdcAmount);

        uint64 pBefore = _prob();
        yesOut = _buyYes(msg.sender, usdcAmount - baseFee - escrow);
        if (yesOut < minYesOut) revert InsufficientOutput();

        usdcInOf[msg.sender] += baseFee + escrow;
        _afterTrade(msg.sender, baseFee, escrow, pBefore);

        emit BoughtYes(msg.sender, usdcAmount, yesOut);
    }

    function buyNo(uint256 usdcAmount, uint256 minNoOut)
        external
        nonReentrant
        returns (uint256 noOut)
    {
        _maybeLock();
        if (status != Status.Open) revert WrongStatus();
        if (usdcAmount == 0) revert ZeroAmount();

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        (uint256 baseFee, uint256 escrow) = _splitFee(usdcAmount);

        uint64 pBefore = _prob();
        noOut = _buyNo(msg.sender, usdcAmount - baseFee - escrow);
        if (noOut < minNoOut) revert InsufficientOutput();

        usdcInOf[msg.sender] += baseFee + escrow;
        _afterTrade(msg.sender, baseFee, escrow, pBefore);

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

    /// @notice Sell YES back to USDC. Both fee slices come off the gross
    ///         proceeds; `minUsdcOut` is checked against the NET the caller
    ///         actually receives. Use {quoteSellYes}.
    function sellYes(uint256 yesAmount, uint256 minUsdcOut)
        external
        nonReentrant
        returns (uint256 usdcOut)
    {
        _maybeLock();
        if (status != Status.Open) revert WrongStatus();

        uint64 pBefore = _prob();
        uint256 gross = _sellYes(msg.sender, yesAmount);

        (uint256 baseFee, uint256 escrow) = _splitFee(gross);
        usdcOut = gross - baseFee - escrow;
        if (usdcOut < minUsdcOut) revert InsufficientOutput();

        if (usdcOut > 0) {
            usdcOutOf[msg.sender] += usdcOut;
            usdc.safeTransfer(msg.sender, usdcOut);
        }
        _afterTrade(msg.sender, baseFee, escrow, pBefore);

        emit SoldYes(msg.sender, yesAmount, usdcOut);
    }

    function sellNo(uint256 noAmount, uint256 minUsdcOut)
        external
        nonReentrant
        returns (uint256 usdcOut)
    {
        _maybeLock();
        if (status != Status.Open) revert WrongStatus();

        uint64 pBefore = _prob();
        uint256 gross = _sellNo(msg.sender, noAmount);

        (uint256 baseFee, uint256 escrow) = _splitFee(gross);
        usdcOut = gross - baseFee - escrow;
        if (usdcOut < minUsdcOut) revert InsufficientOutput();

        if (usdcOut > 0) {
            usdcOutOf[msg.sender] += usdcOut;
            usdc.safeTransfer(msg.sender, usdcOut);
        }
        _afterTrade(msg.sender, baseFee, escrow, pBefore);

        emit SoldNo(msg.sender, noAmount, usdcOut);
    }

    /// @dev Returns GROSS proceeds and does not transfer; the external wrapper
    ///      deducts the fees and pays out the remainder.
    function _sellYes(address from, uint256 yesAmount) internal returns (uint256 gross) {
        if (yesAmount == 0) revert ZeroAmount();
        if (yesReserve == 0 || noReserve == 0) revert ZeroReserves();
        if (yesBalanceOf[from] < yesAmount) revert InsufficientOutcomeBalance();

        uint256 s = _solveExitSwap(yesAmount, yesReserve, noReserve);
        uint256 noOut = _calcYesForNo(s, yesReserve, noReserve);
        yesReserve += s;
        noReserve -= noOut;

        uint256 yesLeft = yesAmount - s;
        uint256 pair = yesLeft < noOut ? yesLeft : noOut;

        yesBalanceOf[from] -= (s + pair);
        if (noOut > pair) noBalanceOf[from] += (noOut - pair);
        totalCollateral -= pair;

        gross = pair;

        _stats.sellYesVolume += _u128(gross);
        _stats.sellYesCount += 1;
        _markTrader(from);
    }

    function _sellNo(address from, uint256 noAmount) internal returns (uint256 gross) {
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

        gross = pair;

        _stats.sellNoVolume += _u128(gross);
        _stats.sellNoCount += 1;
        _markTrader(from);
    }

    /*//////////////////////////////////////////////////////////////
                          ODDSSHIFT LIFECYCLE
    //////////////////////////////////////////////////////////////*/

    function _splitFee(uint256 amount) internal view returns (uint256 baseFee, uint256 escrow) {
        baseFee = amount * baseFeeBps / BPS;
        escrow = amount * protectionFeeBps / BPS;
    }

    /// @dev The "afterSwap" hook: bank the base fee, append the trade to the
    ///      probability history, then let the window machine run. Every buy and
    ///      sell appends a trade, zero-escrow dust included — a gap in the
    ///      history would silently corrupt the next window's anchor.
    function _afterTrade(address trader, uint256 baseFee, uint256 escrow, uint64 pBefore)
        internal
    {
        if (baseFee > 0) {
            cumBaseFee += baseFee;
            _payLps(trader, baseFee);
        }

        uint64 pAfter = _prob();
        uint256 id = trades.length;
        trades.push(
            Trade({
                trader: trader,
                pBefore: pBefore,
                outcome: uint8(TradeOutcome.Pending),
                escrow: _u128(escrow),
                ts: uint64(block.timestamp),
                pAfter: pAfter
            })
        );
        tradeIdsOf[trader].push(id);
        pendingEscrow += escrow;

        emit TradeRecorded(id, trader, baseFee, escrow, pBefore, pAfter);

        _process();
    }

    /// @dev The whole state machine, O(1) amortised and triggered by ordinary
    ///      trades — no keeper. Two things can happen per pass: an open shock
    ///      closes, or the oldest complete window is marked / retired. Windows
    ///      slide one trade at a time and never span a resolved shock.
    function _process() internal {
        uint256 n = trades.length;
        while (true) {
            // An open shock freezes everything until it is decided.
            if (shockOpen && !_tryCloseByFlow(n)) return;

            uint256 first = nextToResolve;
            if (n - first < lookback) return;

            uint256 last = first + lookback - 1;
            uint64 anchor = trades[first].pBefore;
            // The window is judged at the price it closed at, not the price now,
            // so a verdict never depends on when this runs.
            uint64 pWindowEnd = trades[last].pAfter;

            if (_jumped(anchor, pWindowEnd)) {
                _openShock(first, last, anchor, pWindowEnd);
            } else {
                // The oldest trade has now been in every window it can ever be
                // in without one tripping. Nothing left to judge it for.
                _finalize(first, TradeOutcome.RefundedNoShock, 0);
                nextToResolve = uint32(first + 1);
            }
        }
    }

    function _openShock(uint256 first, uint256 last, uint64 anchor, uint64 pShock) internal {
        int8 dir = pShock > anchor ? int8(1) : int8(-1);
        shocks.push(
            Shock({
                pAnchor: anchor,
                pShock: pShock,
                firstId: uint32(first),
                triggerId: uint32(last),
                ts: uint64(block.timestamp),
                dir: dir,
                outcome: uint8(ShockOutcome.Open),
                pEnd: 0,
                resolvedAt: 0
            })
        );
        shockOpen = true;

        emit ShockDetected(shocks.length - 1, uint32(first), uint32(last), anchor, pShock, dir);
    }

    /// @dev Decide the open shock from order flow alone. Reverting early is a
    ///      feature: the first observation trade that brings the probability back
    ///      inside the threshold ends the shock and refunds the window.
    ///      The loop is bounded by `observeWindow`.
    function _tryCloseByFlow(uint256 n) internal returns (bool) {
        Shock storage s = shocks[shocks.length - 1];
        uint64 anchor = s.pAnchor;
        uint256 firstObs = uint256(s.triggerId) + 1;
        uint256 deadline = firstObs + observeWindow; // exclusive
        uint256 end = n < deadline ? n : deadline;

        for (uint256 i = firstObs; i < end; ++i) {
            uint64 pi = trades[i].pAfter;
            if (!_jumped(anchor, pi)) {
                _closeShock(true, pi, i + 1);
                return true;
            }
        }
        if (n >= deadline) {
            _closeShock(false, trades[deadline - 1].pAfter, deadline);
            return true;
        }
        return false;
    }

    /// @dev Close the open shock at `p` — the time fallback's verdict, used when
    ///      the market has gone quiet or is being settled.
    function _closeShockStale(uint64 p) internal {
        _closeShock(!_jumped(shocks[shocks.length - 1].pAnchor, p), p, trades.length);
    }

    /// @dev The verdict. REVERTED refunds the whole window. TOXIC charges only
    ///      the trades that pushed the probability further in the shock's own
    ///      direction than `contribThreshold`: a corrector is never punished for
    ///      a large counter-move, and a small same-direction trade did not cause
    ///      the dislocation. The loop is bounded by `lookback`.
    function _closeShock(bool reverted, uint64 pEnd, uint256 resolvedAt) internal {
        uint256 sid = shocks.length - 1;
        Shock storage s = shocks[sid];

        s.outcome = uint8(reverted ? ShockOutcome.Reverted : ShockOutcome.Toxic);
        s.pEnd = pEnd;
        s.resolvedAt = uint32(resolvedAt);
        shockOpen = false;

        uint256 triggerId = s.triggerId;
        int256 dir = s.dir;

        uint256 refunded;
        uint256 charged;
        for (uint256 i = s.firstId; i <= triggerId; ++i) {
            TradeOutcome o = reverted ? TradeOutcome.RefundedReverted : _verdict(i, dir);
            uint256 amt = _finalize(i, o, sid);
            if (o == TradeOutcome.Charged) charged += amt;
            else refunded += amt;
        }

        // The observation trades stay pending and become the head of the next
        // window: a new window never reaches back across a resolved shock.
        nextToResolve = uint32(triggerId + 1);

        emit ShockResolved(sid, reverted, pEnd, refunded, charged);
    }

    /// @dev Was trade `id` a cause of a toxic shock? Only a move in the shock's
    ///      own direction (`dir`) larger than `contribThreshold` counts.
    function _verdict(uint256 id, int256 dir) private view returns (TradeOutcome) {
        Trade storage t = trades[id];
        int256 impact = int256(uint256(t.pAfter)) - int256(uint256(t.pBefore));
        if (dir < 0) impact = -impact;
        return
            impact > int256(uint256(contribThreshold))
            ? TradeOutcome.Charged
            : TradeOutcome.RefundedMinor;
    }

    /// @param shockId Meaningful only when `o` is not {RefundedNoShock}.
    function _finalize(uint256 id, TradeOutcome o, uint256 shockId)
        internal
        returns (uint256 amt)
    {
        Trade storage t = trades[id];
        amt = t.escrow;
        t.outcome = uint8(o);
        pendingEscrow -= amt;

        if (amt > 0) {
            if (o == TradeOutcome.Charged) {
                cumChargedFee += amt;
                _payLps(t.trader, amt);
            } else {
                rebateClaimable[t.trader] += amt;
                totalRebateOwed += amt;
                cumRebated += amt;
            }
        }

        emit TradeJudged(id, t.trader, amt, uint8(o), shockId);
    }

    /// @dev Credit USDC to LPs pro rata. The `fallbackTo` branch is unreachable
    ///      in practice — a market always has the initiator's locked LP shares —
    ///      but money with no owner would be stranded, so it goes back instead.
    function _payLps(address fallbackTo, uint256 amt) internal {
        if (totalLpShares > 0) {
            accLpRewardPerShare += amt * ACC_PRECISION / totalLpShares;
            totalLpRewardOwed += amt;
        } else {
            rebateClaimable[fallbackTo] += amt;
            totalRebateOwed += amt;
        }
    }

    /// @inheritdoc IEventMarketV2
    function resolveStale() external nonReentrant {
        uint256 n = trades.length;
        if (nextToResolve >= n) revert NothingToResolve();
        if (uint256(trades[n - 1].ts) + cooldown > block.timestamp) revert CooldownNotElapsed();

        _flushAll();
    }

    /// @dev Drain the queue at the current probability: close an open shock,
    ///      run the ordinary count-based machine, and judge whatever partial
    ///      window is left over. Bounded, because at most
    ///      `lookback + observeWindow` trades can be pending at once.
    function _flushAll() internal {
        uint64 p = _prob();
        while (nextToResolve < trades.length) {
            if (shockOpen) {
                _closeShockStale(p);
            } else {
                _process();
                if (!shockOpen && nextToResolve < trades.length) _flushPartial(p);
            }
        }
    }

    /// @dev The leftover trades never filled a window. If the market is still
    ///      displaced relative to the oldest one, they ARE the shock — mark it
    ///      and settle it on the spot (it cannot revert: `p` is already past the
    ///      threshold). Otherwise nothing happened and they are refunded.
    function _flushPartial(uint64 p) internal {
        uint256 n = trades.length;
        uint256 first = nextToResolve;
        uint64 anchor = trades[first].pBefore;

        if (_jumped(anchor, p)) {
            _openShock(first, n - 1, anchor, p);
            _closeShockStale(p);
        } else {
            for (uint256 i = first; i < n; ++i) {
                _finalize(i, TradeOutcome.RefundedNoShock, 0);
            }
            nextToResolve = uint32(n);
        }
    }

    function claimRebate() external nonReentrant {
        uint256 amt = rebateClaimable[msg.sender];
        if (amt == 0) revert NothingToClaim();

        rebateClaimable[msg.sender] = 0;
        totalRebateOwed -= amt;
        usdcOutOf[msg.sender] += amt;
        usdc.safeTransfer(msg.sender, amt);

        emit RebateClaimed(msg.sender, amt);
    }

    function claimLpReward() external nonReentrant {
        _harvest(msg.sender);
        _syncDebt(msg.sender);

        uint256 amt = lpRewardPending[msg.sender];
        if (amt == 0) revert NothingToClaim();

        lpRewardPending[msg.sender] = 0;
        // Integer-division dust stays behind in totalLpRewardOwed; the contract
        // holding marginally more than it owes is the safe direction.
        totalLpRewardOwed = totalLpRewardOwed > amt ? totalLpRewardOwed - amt : 0;
        usdcOutOf[msg.sender] += amt;
        usdc.safeTransfer(msg.sender, amt);

        emit LpRewardClaimed(msg.sender, amt);
    }

    /// @dev Bank whatever the caller's current shares have accrued. Must run
    ///      BEFORE any change to lpShares, paired with {_syncDebt} after.
    function _harvest(address u) internal {
        uint256 s = lpShares[u];
        if (s == 0) return;
        uint256 acc = s * accLpRewardPerShare / ACC_PRECISION;
        uint256 debt = lpRewardDebt[u];
        if (acc > debt) lpRewardPending[u] += acc - debt;
    }

    function _syncDebt(address u) internal {
        lpRewardDebt[u] = lpShares[u] * accLpRewardPerShare / ACC_PRECISION;
    }

    function _absDiff(uint64 a, uint64 b) private pure returns (uint256) {
        return a > b ? uint256(a - b) : uint256(b - a);
    }

    /// @dev Absolute displacement, in probability points — the same convention
    ///      the whole mechanism uses. 5 points is 5 points at any price level.
    function _jumped(uint64 a, uint64 b) private view returns (bool) {
        return _absDiff(a, b) >= jumpThreshold;
    }

    /// @dev YES probability in 1e6 fixed point. Same formula as
    ///      {yesProbability}, at the narrower scale the Trade record packs into.
    function _prob() internal view returns (uint64) {
        uint256 total = yesReserve + noReserve;
        if (total == 0) return uint64(PROB_ONE / 2);
        return uint64(noReserve * PROB_ONE / total);
    }

    /*//////////////////////////////////////////////////////////////
                       EARLY EXIT (PAIR REDEEM)
    //////////////////////////////////////////////////////////////*/

    /// @dev No trade fee: a pair redeem does not touch the reserves and so
    ///      cannot move the implied probability.
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

    function setMetadata(string calldata question_, string calldata resolutionSource_)
        external
        onlyAdmin
    {
        if (status == Status.Settled) revert WrongStatus();
        question = question_;
        resolutionSource = resolutionSource_;
        emit MetadataUpdated(question_, resolutionSource_);
    }

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

        // Judge anything still queued against the frozen closing probability, so
        // no escrow is left undecided once the market is settled.
        _flushAll();

        yesWins = yesWins_;
        reasoning = reasoning_;
        status = Status.Settled;

        uint256 platformFee = totalCollateral * platformFeeBps / BPS;
        uint256 creatorFee = totalCollateral * creatorFeeBps / BPS;

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

    function emergencyForceDraw() external nonReentrant {
        _maybeLock();
        if (status != Status.Locked) revert WrongStatus();
        if (block.timestamp < resolveAfter + EMERGENCY_TIMELOCK) {
            revert EmergencyTimelockNotExpired();
        }

        _flushAll();

        isDraw = true;
        status = Status.Settled;

        uint256 total = yesReserve + noReserve;
        if (total == 0) {
            netUsdcPerYesToken = ONE / 2;
            netUsdcPerNoToken = ONE - netUsdcPerYesToken;
        } else {
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
    ///         Independent of {claimLpReward}, which pays OddsShift fees.
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

    /// @notice YES tokens received for `usdcAmount` TOTAL spend, both fees included.
    function quoteYes(uint256 usdcAmount) external view returns (uint256) {
        uint256 net = usdcAmount - _totalFee(usdcAmount);
        return net + _calcNoForYes(net, yesReserve, noReserve);
    }

    function quoteNo(uint256 usdcAmount) external view returns (uint256) {
        uint256 net = usdcAmount - _totalFee(usdcAmount);
        return net + _calcYesForNo(net, yesReserve, noReserve);
    }

    /// @notice NET USDC received for selling `yesAmount`, both fees deducted.
    function quoteSellYes(uint256 yesAmount) external view returns (uint256) {
        if (yesAmount == 0 || yesReserve == 0 || noReserve == 0) return 0;
        uint256 s = _solveExitSwap(yesAmount, yesReserve, noReserve);
        uint256 noOut = _calcYesForNo(s, yesReserve, noReserve);
        uint256 yesLeft = yesAmount - s;
        uint256 gross = yesLeft < noOut ? yesLeft : noOut;
        return gross - _totalFee(gross);
    }

    function quoteSellNo(uint256 noAmount) external view returns (uint256) {
        if (noAmount == 0 || yesReserve == 0 || noReserve == 0) return 0;
        uint256 s = _solveExitSwap(noAmount, noReserve, yesReserve);
        uint256 yesOut = _calcNoForYes(s, yesReserve, noReserve);
        uint256 noLeft = noAmount - s;
        uint256 gross = noLeft < yesOut ? noLeft : yesOut;
        return gross - _totalFee(gross);
    }

    /// @dev Sum of the two slices, rounded exactly the way the trade rounds them.
    function _totalFee(uint256 amount) internal view returns (uint256) {
        (uint256 baseFee, uint256 escrow) = _splitFee(amount);
        return baseFee + escrow;
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

    function getStats() external view returns (Stats memory) {
        return _stats;
    }

    function getMarketState() external view returns (MarketInfo memory info, Stats memory stats) {
        info = _marketInfo();
        stats = _stats;
    }

    function getUserState(address u)
        external
        view
        returns (MarketInfo memory info, UserState memory pos)
    {
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

    function getOddsShiftInfo() external view returns (OddsShiftInfo memory) {
        uint256 n = trades.length;
        uint256 pending = n - nextToResolve;
        return OddsShiftInfo({
            baseFeeBps: baseFeeBps,
            protectionFeeBps: protectionFeeBps,
            jumpThreshold: jumpThreshold,
            contribThreshold: contribThreshold,
            lookback: lookback,
            observeWindow: observeWindow,
            cooldown: cooldown,
            currentProb: _prob(),
            windowAnchorProb: pending == 0 ? 0 : trades[nextToResolve].pBefore,
            totalTrades: n,
            nextToResolve: nextToResolve,
            pendingCount: pending,
            totalShocks: shocks.length,
            shockOpen: shockOpen,
            openShockId: shockOpen ? shocks.length - 1 : 0,
            pendingEscrow: pendingEscrow,
            totalRebateOwed: totalRebateOwed,
            totalLpRewardOwed: totalLpRewardOwed,
            accLpRewardPerShare: accLpRewardPerShare,
            cumBaseFee: cumBaseFee,
            cumChargedFee: cumChargedFee,
            cumRebated: cumRebated
        });
    }

    function getTrades(uint256 from, uint256 count) external view returns (Trade[] memory out) {
        uint256 n = trades.length;
        if (from > n) revert BadRange();
        uint256 end = from + count;
        if (end > n) end = n;
        out = new Trade[](end - from);
        for (uint256 i = from; i < end; ++i) {
            out[i - from] = trades[i];
        }
    }

    function getShocks(uint256 from, uint256 count) external view returns (Shock[] memory out) {
        uint256 n = shocks.length;
        if (from > n) revert BadRange();
        uint256 end = from + count;
        if (end > n) end = n;
        out = new Shock[](end - from);
        for (uint256 i = from; i < end; ++i) {
            out[i - from] = shocks[i];
        }
    }

    /// @notice A user's OddsShift balances. The trade log itself is not returned
    ///         here — the UI already pulls the whole probability history with
    ///         {getTrades} for the chart and filters it by `trader` locally,
    ///         and a second copy of the struct-array encoder does not fit under
    ///         EIP-170.
    function getUserOddsShift(address u) external view returns (OddsShiftUserState memory) {
        uint256[] storage ids = tradeIdsOf[u];
        uint256 n = ids.length;

        uint256 pending;
        for (uint256 i = 0; i < n; ++i) {
            Trade storage t = trades[ids[i]];
            if (t.outcome == uint8(TradeOutcome.Pending)) pending += t.escrow;
        }

        return OddsShiftUserState({
            rebateClaimable: rebateClaimable[u],
            lpRewardClaimable: _lpRewardClaimable(u),
            pendingEscrow: pending,
            tradeCount: n
        });
    }

    function _lpRewardClaimable(address u) internal view returns (uint256) {
        uint256 acc = lpShares[u] * accLpRewardPerShare / ACC_PRECISION;
        uint256 debt = lpRewardDebt[u];
        return lpRewardPending[u] + (acc > debt ? acc - debt : 0);
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

    function _calcNoForYes(uint256 noIn, uint256 yesRes, uint256 noRes)
        internal
        view
        returns (uint256)
    {
        if (yesRes == 0 || noRes == 0) return 0;
        uint256 effectiveIn = noIn * (BPS - lpSwapFeeBps) / BPS;
        return yesRes * effectiveIn / (noRes + effectiveIn);
    }

    function _calcYesForNo(uint256 yesIn, uint256 yesRes, uint256 noRes)
        internal
        view
        returns (uint256)
    {
        if (yesRes == 0 || noRes == 0) return 0;
        uint256 effectiveIn = yesIn * (BPS - lpSwapFeeBps) / BPS;
        return noRes * effectiveIn / (yesRes + effectiveIn);
    }

    function _solveExitSwap(uint256 amount, uint256 reserveIn, uint256 reserveOut)
        internal
        view
        returns (uint256 s)
    {
        uint256 phi = BPS - lpSwapFeeBps;
        uint256 ab = reserveIn * BPS + reserveOut * phi;
        uint256 c = amount * phi;
        uint256 C = amount * reserveIn * BPS;
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
