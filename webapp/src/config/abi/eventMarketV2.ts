// EventMarketV2 — the OddsShift demo market.
// Keep in sync with contracts/src/interfaces/IEventMarketV2.sol.
//
// Deliberately standalone: the /oddsshift page targets one V2 contract and does
// not share an ABI with the V1 pages.
//
// Note there are no per-field OddsShift getters. EIP-170 left the contract room
// for exactly two aggregate views — `getOddsShiftInfo` and `getUserOddsShift` —
// plus the two paged log readers, so everything the page shows comes from those.

const TRADE_TUPLE = [
  { name: 'trader', type: 'address' },
  { name: 'pBefore', type: 'uint64' },
  { name: 'outcome', type: 'uint8' },
  { name: 'escrow', type: 'uint128' },
  { name: 'ts', type: 'uint64' },
  { name: 'pAfter', type: 'uint64' },
] as const

const SHOCK_TUPLE = [
  { name: 'pAnchor', type: 'uint64' },
  { name: 'pShock', type: 'uint64' },
  { name: 'firstId', type: 'uint32' },
  { name: 'triggerId', type: 'uint32' },
  { name: 'ts', type: 'uint64' },
  { name: 'dir', type: 'int8' },
  { name: 'outcome', type: 'uint8' },
  { name: 'pEnd', type: 'uint64' },
  { name: 'resolvedAt', type: 'uint32' },
] as const

const ODDS_SHIFT_INFO_TUPLE = [
  // ── parameters ──
  { name: 'baseFeeBps', type: 'uint16' },
  { name: 'protectionFeeBps', type: 'uint16' },
  { name: 'jumpThreshold', type: 'uint32' },
  { name: 'contribThreshold', type: 'uint32' },
  { name: 'lookback', type: 'uint32' },
  { name: 'observeWindow', type: 'uint32' },
  { name: 'cooldown', type: 'uint32' },
  // ── live state ──
  { name: 'currentProb', type: 'uint64' },
  { name: 'windowAnchorProb', type: 'uint64' },
  { name: 'totalTrades', type: 'uint256' },
  { name: 'nextToResolve', type: 'uint256' },
  { name: 'pendingCount', type: 'uint256' },
  { name: 'totalShocks', type: 'uint256' },
  { name: 'shockOpen', type: 'bool' },
  { name: 'openShockId', type: 'uint256' },
  // ── money ──
  { name: 'pendingEscrow', type: 'uint256' },
  { name: 'totalRebateOwed', type: 'uint256' },
  { name: 'totalLpRewardOwed', type: 'uint256' },
  { name: 'accLpRewardPerShare', type: 'uint256' },
  { name: 'cumBaseFee', type: 'uint256' },
  { name: 'cumChargedFee', type: 'uint256' },
  { name: 'cumRebated', type: 'uint256' },
] as const

export const EVENT_MARKET_V2_ABI = [
  // ── market reads ──
  { type: 'function', name: 'question', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'resolutionSource', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'bettingDeadline', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'resolveAfter', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'status', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'yesWins', inputs: [], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'yesReserve', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'noReserve', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalCollateral', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalLpShares', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'usdc', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },

  // ── per-user ──
  { type: 'function', name: 'yesBalanceOf', inputs: [{ name: 'u', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'noBalanceOf', inputs: [{ name: 'u', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'lpShares', inputs: [{ name: 'u', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'usdcInOf', inputs: [{ name: 'u', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },

  // ── quotes (the full 1% entry fee already applied) ──
  { type: 'function', name: 'quoteYes', inputs: [{ name: 'usdcAmount', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'quoteNo', inputs: [{ name: 'usdcAmount', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'quoteSellYes', inputs: [{ name: 'yesAmount', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'quoteSellNo', inputs: [{ name: 'noAmount', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },

  // ── OddsShift reads ──
  {
    type: 'function',
    name: 'getOddsShiftInfo',
    inputs: [],
    outputs: [{ name: '', type: 'tuple', components: ODDS_SHIFT_INFO_TUPLE }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getTrades',
    inputs: [
      { name: 'from', type: 'uint256' },
      { name: 'count', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'tuple[]', components: TRADE_TUPLE }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getShocks',
    inputs: [
      { name: 'from', type: 'uint256' },
      { name: 'count', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'tuple[]', components: SHOCK_TUPLE }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getUserOddsShift',
    inputs: [{ name: 'u', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'rebateClaimable', type: 'uint256' },
          { name: 'lpRewardClaimable', type: 'uint256' },
          { name: 'pendingEscrow', type: 'uint256' },
          { name: 'tradeCount', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },

  // ── writes ──
  { type: 'function', name: 'buyYes', inputs: [{ name: 'usdcAmount', type: 'uint256' }, { name: 'minYesOut', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'buyNo', inputs: [{ name: 'usdcAmount', type: 'uint256' }, { name: 'minNoOut', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'sellYes', inputs: [{ name: 'yesAmount', type: 'uint256' }, { name: 'minUsdcOut', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'sellNo', inputs: [{ name: 'noAmount', type: 'uint256' }, { name: 'minUsdcOut', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'addLiquidity', inputs: [{ name: 'usdcAmount', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'claimRebate', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'claimLpReward', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'resolveStale', inputs: [], outputs: [], stateMutability: 'nonpayable' },

  // ── events (the UI reads verdicts from state; these are for debugging) ──
  {
    type: 'event',
    name: 'TradeRecorded',
    inputs: [
      { name: 'tradeId', type: 'uint256', indexed: true },
      { name: 'trader', type: 'address', indexed: true },
      { name: 'baseFee', type: 'uint256', indexed: false },
      { name: 'escrow', type: 'uint256', indexed: false },
      { name: 'pBefore', type: 'uint64', indexed: false },
      { name: 'pAfter', type: 'uint64', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ShockDetected',
    inputs: [
      { name: 'shockId', type: 'uint256', indexed: true },
      { name: 'firstTradeId', type: 'uint32', indexed: false },
      { name: 'triggerTradeId', type: 'uint32', indexed: false },
      { name: 'pAnchor', type: 'uint64', indexed: false },
      { name: 'pShock', type: 'uint64', indexed: false },
      { name: 'dir', type: 'int8', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ShockResolved',
    inputs: [
      { name: 'shockId', type: 'uint256', indexed: true },
      { name: 'reverted', type: 'bool', indexed: false },
      { name: 'pEnd', type: 'uint64', indexed: false },
      { name: 'refunded', type: 'uint256', indexed: false },
      { name: 'charged', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'TradeJudged',
    inputs: [
      { name: 'tradeId', type: 'uint256', indexed: true },
      { name: 'trader', type: 'address', indexed: true },
      { name: 'escrow', type: 'uint256', indexed: false },
      { name: 'outcome', type: 'uint8', indexed: false },
      { name: 'shockId', type: 'uint256', indexed: false },
    ],
  },
] as const

/** What happened to a trade's escrowed 0.70%. Mirrors IEventMarketV2.TradeOutcome. */
export const TradeOutcome = {
  Pending: 0,
  RefundedNoShock: 1,
  RefundedReverted: 2,
  RefundedMinor: 3,
  Charged: 4,
} as const

/** Mirrors IEventMarketV2.ShockOutcome. `Open` is 0, i.e. still observing. */
export const ShockOutcome = {
  Open: 0,
  Reverted: 1,
  Toxic: 2,
} as const

export type OddsShiftTrade = {
  trader: `0x${string}`
  /** YES probability immediately before the trade, 1e6 scale. */
  pBefore: bigint
  /** One of TradeOutcome. */
  outcome: number
  escrow: bigint
  ts: bigint
  /** YES probability immediately after. The trade's own impact is pAfter - pBefore. */
  pAfter: bigint
}

export type OddsShiftShock = {
  pAnchor: bigint
  pShock: bigint
  firstId: number
  triggerId: number
  ts: bigint
  /** +1 the jump pushed YES up, -1 pushed it down. */
  dir: number
  /** One of ShockOutcome. */
  outcome: number
  pEnd: bigint
  resolvedAt: number
}

export type OddsShiftInfo = {
  baseFeeBps: number
  protectionFeeBps: number
  jumpThreshold: number
  contribThreshold: number
  lookback: number
  observeWindow: number
  cooldown: number
  currentProb: bigint
  windowAnchorProb: bigint
  totalTrades: bigint
  nextToResolve: bigint
  pendingCount: bigint
  totalShocks: bigint
  shockOpen: boolean
  openShockId: bigint
  pendingEscrow: bigint
  totalRebateOwed: bigint
  totalLpRewardOwed: bigint
  accLpRewardPerShare: bigint
  cumBaseFee: bigint
  cumChargedFee: bigint
  cumRebated: bigint
}

export type OddsShiftUserState = {
  rebateClaimable: bigint
  lpRewardClaimable: bigint
  pendingEscrow: bigint
  tradeCount: bigint
}

/** Contract-side probability scale: 500_000 === 50%. */
export const PROB_SCALE = 1_000_000

export const probToPercent = (p: bigint | number): number => (Number(p) / PROB_SCALE) * 100

/** A trade's own signed probability impact, in percentage points. */
export const impactPoints = (t: OddsShiftTrade): number =>
  probToPercent(t.pAfter) - probToPercent(t.pBefore)

/** Everything except Pending and Charged means the 0.70% went back to the trader. */
export const isRefunded = (outcome: number): boolean =>
  outcome === TradeOutcome.RefundedNoShock ||
  outcome === TradeOutcome.RefundedReverted ||
  outcome === TradeOutcome.RefundedMinor
