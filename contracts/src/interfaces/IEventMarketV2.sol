// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEventMarket} from "./IEventMarket.sol";

/// @title IEventMarketV2 - EventMarket + OddsShift window-based LP protection
/// @notice Everything IEventMarket exposes, plus the OddsShift escrow lifecycle.
///         See `oddsshift_todos.md` at the repo root for the mechanism spec and
///         the list of deliberate demo-scope simplifications.
///
/// OddsShift in one paragraph: every buy and every sell pays a flat **1%**, split
/// into a `baseFeeBps` (0.30%) slice that goes to LPs immediately and a
/// `protectionFeeBps` (0.70%) slice that is escrowed. After each trade the market
/// looks back over the last `lookback` trades: if their NET probability
/// displacement is at least `jumpThreshold`, a {Shock} is recorded (the "打点"
/// mark) covering exactly those trades. The next `observeWindow` trades decide it:
/// the moment the probability comes back within `jumpThreshold` of the window's
/// anchor the shock REVERTED and every trade in it is refunded its 0.70% (net cost
/// 0.30%); if the observation window runs out with the market still displaced the
/// shock is TOXIC and the trades that pushed the probability in the shock's own
/// direction by more than `contribThreshold` forfeit their 0.70% to LPs (net cost
/// 1.00%). Counter-directional trades — the correctors — and same-direction trades
/// under `contribThreshold` are always refunded. A trade that slides out of the
/// lookback window without ever triggering a shock is refunded too.
///
/// {resolveStale} is the permissionless time fallback for a quiet market.
interface IEventMarketV2 is IEventMarket {
    error ZeroCollateralToken();
    /*//////////////////////////////////////////////////////////////
                                 TYPES
    //////////////////////////////////////////////////////////////*/

    /// @notice What happened to a trade's escrowed protection fee.
    /// @dev    Everything except {Charged} means the 0.70% went back to the
    ///         trader; the three refund reasons are kept apart so the UI can say
    ///         WHY. Stored as a uint8 inside {Trade} to keep the struct at two
    ///         slots.
    enum TradeOutcome {
        Pending, // still escrowed, no verdict yet
        RefundedNoShock, // slid out of the lookback window, never in a shock
        RefundedReverted, // was in a shock, the market came back
        RefundedMinor, // shock was toxic, but this trade did not push it there
        Charged // shock was toxic and this trade helped cause it
    }

    /// @notice One trade in the OddsShift log. Every buy and sell appends one,
    ///         including zero-escrow dust, because the probability history has to
    ///         be complete for the window anchors to mean anything.
    /// @dev    Packed into two slots. Probabilities are 1e6 fixed point
    ///         (500_000 == 50%). This trade's own impact is `pAfter - pBefore`.
    struct Trade {
        address trader; // slot 0
        uint64 pBefore; // YES probability immediately BEFORE this trade executed
        uint8 outcome; // TradeOutcome
        uint128 escrow; // slot 1: protection fee held for this trade
        uint64 ts; // block.timestamp of the trade
        uint64 pAfter; // YES probability immediately AFTER this trade executed
    }

    /// @notice A detected probability jump, plus its verdict.
    /// @dev    Packed into two slots. The window it judges is the trade id range
    ///         [firstId, triggerId] — `lookback` trades, or fewer when
    ///         {resolveStale} marks a partial window in a quiet market.
    struct Shock {
        uint64 pAnchor; // slot 0: YES probability before the window's first trade
        uint64 pShock; // YES probability at the moment of detection
        uint32 firstId; // first trade of the window
        uint32 triggerId; // the trade that tripped the threshold ("打点")
        uint64 ts; // detection timestamp
        int8 dir; // slot 1: +1 the jump pushed YES up, -1 pushed it down
        uint8 outcome; // ShockOutcome
        uint64 pEnd; // YES probability at resolution (0 while open)
        uint32 resolvedAt; // trades.length at resolution (0 while open)
    }

    /// @dev `Open == 0` so `shock.outcome == 0` is the "still observing" test.
    enum ShockOutcome {
        Open,
        Reverted,
        Toxic
    }

    /// @notice Everything the OddsShift UI needs about the market, in one call.
    struct OddsShiftInfo {
        // ── parameters ──
        uint16 baseFeeBps; // charged on every trade, straight to LPs, never refunded
        uint16 protectionFeeBps; // charged on every trade, escrowed pending a verdict
        uint32 jumpThreshold; // 1e6 fixed point; 50_000 == 5 probability points
        uint32 contribThreshold; // 1e6 fixed point; 10_000 == 1 probability point
        uint32 lookback; // trades per detection window
        uint32 observeWindow; // trades granted to a shock before it turns toxic
        uint32 cooldown; // seconds of quiet before resolveStale() may act
        // ── live state ──
        uint64 currentProb; // live YES probability, 1e6 fixed point
        uint64 windowAnchorProb; // anchor of the window now forming (0 if none pending)
        uint256 totalTrades; // trades.length
        uint256 nextToResolve; // first trade without a verdict
        uint256 pendingCount; // totalTrades - nextToResolve
        uint256 totalShocks; // shocks.length
        bool shockOpen; // a shock is inside its observation window right now
        uint256 openShockId; // meaningful only when shockOpen
        // ── money ──
        uint256 pendingEscrow; // USDC held for trades without a verdict
        uint256 totalRebateOwed; // USDC credited to traders, unclaimed
        uint256 totalLpRewardOwed; // USDC credited to LPs, unclaimed
        uint256 accLpRewardPerShare; // 1e18-scaled cumulative LP reward per share
        uint256 cumBaseFee; // lifetime base fee routed to LPs
        uint256 cumChargedFee; // lifetime protection fee forfeited to LPs
        uint256 cumRebated; // lifetime protection fee returned to traders
    }

    /// @notice A user's OddsShift-side balances.
    struct OddsShiftUserState {
        uint256 rebateClaimable; // refunded protection fees, ready to claim
        uint256 lpRewardClaimable; // base + forfeited fees earned as an LP
        uint256 pendingEscrow; // this user's escrow still awaiting a verdict
        uint256 tradeCount; // how many OddsShift trades this user has made
    }

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event TradeRecorded(
        uint256 indexed tradeId,
        address indexed trader,
        uint256 baseFee,
        uint256 escrow,
        uint64 pBefore,
        uint64 pAfter
    );

    /// @param firstTradeId First trade of the window this shock judges.
    /// @param triggerTradeId The trade that tripped `jumpThreshold`.
    event ShockDetected(
        uint256 indexed shockId,
        uint32 firstTradeId,
        uint32 triggerTradeId,
        uint64 pAnchor,
        uint64 pShock,
        int8 dir
    );

    event ShockResolved(
        uint256 indexed shockId, bool reverted, uint64 pEnd, uint256 refunded, uint256 charged
    );

    event TradeJudged(
        uint256 indexed tradeId,
        address indexed trader,
        uint256 escrow,
        uint8 outcome,
        uint256 shockId
    );

    event RebateClaimed(address indexed trader, uint256 amount);
    event LpRewardClaimed(address indexed lp, uint256 amount);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    error InvalidOddsShiftParams();
    error NothingToClaim();
    error NothingToResolve();
    error CooldownNotElapsed();
    error BadRange();

    /*//////////////////////////////////////////////////////////////
                               FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Permissionless fallback for a quiet market: once `cooldown`
    ///         seconds have passed since the last trade, close any open shock and
    ///         judge every remaining trade against the current probability,
    ///         marking the leftover partial window as a shock if it is displaced.
    ///         Breaks the two deadlocks a pure trade-count window has — the tail
    ///         of the queue that never fills a window, and "I moved the market,
    ///         nobody followed up, so my escrow never resolves".
    function resolveStale() external;

    function claimRebate() external;
    function claimLpReward() external;

    /// @notice Everything the market-level UI needs, in one call. Deliberately
    ///         the ONLY way to read the counters and queue state: EIP-170 leaves
    ///         no room for per-field getters on top of it.
    function getOddsShiftInfo() external view returns (OddsShiftInfo memory);

    /// @notice `count` is clamped to the tail, so `(0, big)` reads everything.
    ///         Reverts {BadRange} only if `from` is past the end.
    function getTrades(uint256 from, uint256 count) external view returns (Trade[] memory);
    function getShocks(uint256 from, uint256 count) external view returns (Shock[] memory);

    function getUserOddsShift(address u) external view returns (OddsShiftUserState memory);
}
