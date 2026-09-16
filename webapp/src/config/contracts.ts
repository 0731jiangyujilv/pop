import { getChainConfig, DEFAULT_CHAIN_ID } from './chains'

// Chain-aware contract address resolution
export function getContractsForChain(chainId: number) {
  const chainConfig = getChainConfig(chainId)
  const zero = '0x0000000000000000000000000000000000000000' as `0x${string}`
  if (!chainConfig) {
    return {
      betFactoryAddress: zero,
      usdcAddress: zero,
      priceOracleFactoryAddress: zero,
      eventBetFactoryAddress: zero,
      predictionMarketFactoryAddress: zero,
    }
  }
  return {
    betFactoryAddress: chainConfig.betFactoryAddress,
    usdcAddress: chainConfig.usdcAddress,
    priceOracleFactoryAddress: chainConfig.priceOracleFactoryAddress,
    eventBetFactoryAddress: chainConfig.eventBetFactoryAddress,
    predictionMarketFactoryAddress: chainConfig.predictionMarketFactoryAddress,
  }
}

// Backward-compatible exports (default chain)
export const BET_FACTORY_ADDRESS = getContractsForChain(DEFAULT_CHAIN_ID).betFactoryAddress
export const USDC_ADDRESS = getContractsForChain(DEFAULT_CHAIN_ID).usdcAddress
import { envConfig } from './env'

export const BET_POR_ADDRESS = envConfig.betPorAddress

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
] as const

export const BET_FACTORY_ABI = [
  { type: 'error', name: 'InvalidAmount', inputs: [] },
  { type: 'error', name: 'InvalidDuration', inputs: [] },
  { type: 'error', name: 'UnsupportedAsset', inputs: [] },
  { type: 'error', name: 'InvalidToken', inputs: [] },
  {
    type: 'function',
    name: 'createBet',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'minAmount', type: 'uint256' },
      { name: 'maxAmount', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
      { name: 'asset', type: 'string' },
      { name: 'initiatorSide', type: 'uint8' },
      { name: 'initiatorAmount', type: 'uint256' },
    ],
    outputs: [
      { name: 'betId', type: 'uint256' },
      { name: 'betContract', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getBet',
    inputs: [{ name: 'betId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getBetCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'BetCreated',
    inputs: [
      { name: 'betId', type: 'uint256', indexed: true },
      { name: 'betContract', type: 'address', indexed: false },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: false },
      { name: 'asset', type: 'string', indexed: false },
    ],
  },
] as const

export const BET_ABI = [
  { type: 'error', name: 'InvalidStatus', inputs: [] },
  { type: 'error', name: 'BettingClosed', inputs: [] },
  { type: 'error', name: 'AlreadyPlaced', inputs: [] },
  { type: 'error', name: 'AmountTooLow', inputs: [] },
  { type: 'error', name: 'AmountTooHigh', inputs: [] },
  { type: 'error', name: 'BetNotExpired', inputs: [] },
  { type: 'error', name: 'NothingToClaim', inputs: [] },
  { type: 'error', name: 'AlreadyClaimed', inputs: [] },
  { type: 'error', name: 'NotAPlayer', inputs: [] },
  { type: 'error', name: 'OracleStalePrice', inputs: [] },
  { type: 'error', name: 'OracleInvalidPrice', inputs: [] },
  { type: 'error', name: 'TimelockNotExpired', inputs: [] },
  { type: 'error', name: 'InvalidFee', inputs: [] },
  {
    type: 'function',
    name: 'placeBet',
    inputs: [
      { name: 'side', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claim',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claimFor',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'asset',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'status',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getBetInfo',
    inputs: [],
    outputs: [
      {
        name: 'info',
        type: 'tuple',
        components: [
          { name: 'creator', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'minAmount', type: 'uint256' },
          { name: 'maxAmount', type: 'uint256' },
          { name: 'duration', type: 'uint256' },
          { name: 'bettingDeadline', type: 'uint256' },
          { name: 'priceFeed', type: 'address' },
          { name: 'startPrice', type: 'int256' },
          { name: 'endPrice', type: 'int256' },
          { name: 'startTime', type: 'uint256' },
          { name: 'endTime', type: 'uint256' },
          { name: 'status', type: 'uint8' },
          { name: 'winningSide', type: 'uint8' },
          { name: 'isDraw', type: 'bool' },
          { name: 'totalUp', type: 'uint256' },
          { name: 'totalDown', type: 'uint256' },
          { name: 'prizePool', type: 'uint256' },
          { name: 'feeBps', type: 'uint256' },
          { name: 'feeRecipient', type: 'address' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getUpPositions',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'player', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getDownPositions',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'player', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'claimable',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'hasClaimed',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const

export const BetStatus = {
  Open: 0,
  Locked: 1,
  Settled: 2,
  Expired: 3,
} as const

export const Side = {
  Up: 0,
  Down: 1,
} as const

export function betStatusLabel(status: number): string {
  switch (status) {
    case BetStatus.Open: return 'Open for Predictions'
    case BetStatus.Locked: return 'Locked'
    case BetStatus.Settled: return 'Settled'
    case BetStatus.Expired: return 'Expired (Refunded)'
    default: return 'Unknown'
  }
}

// ============================================================
// EventBet ABIs (YES/NO event prediction)
// ============================================================

export const EVENT_BET_FACTORY_ABI = [
  { type: 'error', name: 'InvalidAmount', inputs: [] },
  { type: 'error', name: 'InvalidClosingTime', inputs: [] },
  { type: 'error', name: 'InvalidToken', inputs: [] },
  {
    type: 'function',
    name: 'createEventBet',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'minAmount', type: 'uint256' },
      { name: 'maxAmount', type: 'uint256' },
      { name: 'closingTime', type: 'uint256' },
      { name: '_question', type: 'string' },
      { name: '_resolutionSource', type: 'string' },
      { name: 'initiatorSide', type: 'uint8' },
      { name: 'initiatorAmount', type: 'uint256' },
    ],
    outputs: [
      { name: 'betId', type: 'uint256' },
      { name: 'betContract', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getEventBet',
    inputs: [{ name: 'betId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getEventBetCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'EventBetCreated',
    inputs: [
      { name: 'betId', type: 'uint256', indexed: true },
      { name: 'betContract', type: 'address', indexed: false },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: false },
      { name: 'question', type: 'string', indexed: false },
    ],
  },
] as const

export const EVENT_BET_ABI = [
  { type: 'error', name: 'InvalidStatus', inputs: [] },
  { type: 'error', name: 'BettingClosed', inputs: [] },
  { type: 'error', name: 'AlreadyPlaced', inputs: [] },
  { type: 'error', name: 'AmountTooLow', inputs: [] },
  { type: 'error', name: 'AmountTooHigh', inputs: [] },
  { type: 'error', name: 'EventNotClosed', inputs: [] },
  { type: 'error', name: 'NothingToClaim', inputs: [] },
  { type: 'error', name: 'AlreadyClaimed', inputs: [] },
  { type: 'error', name: 'NotAPlayer', inputs: [] },
  { type: 'error', name: 'InvalidOutcome', inputs: [] },
  {
    type: 'function',
    name: 'question',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'resolutionSource',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'placeBet',
    inputs: [
      { name: 'side', type: 'uint8' },
      { name: 'amount_', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claim',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claimFor',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getEventBetInfo',
    inputs: [],
    outputs: [
      {
        name: 'info',
        type: 'tuple',
        components: [
          { name: 'creator', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'minAmount', type: 'uint256' },
          { name: 'maxAmount', type: 'uint256' },
          { name: 'closingTime', type: 'uint256' },
          { name: 'bettingDeadline', type: 'uint256' },
          { name: 'status', type: 'uint8' },
          { name: 'outcome', type: 'uint8' },
          { name: 'winningSide', type: 'uint8' },
          { name: 'isDraw', type: 'bool' },
          { name: 'totalYes', type: 'uint256' },
          { name: 'totalNo', type: 'uint256' },
          { name: 'prizePool', type: 'uint256' },
          { name: 'feeBps', type: 'uint256' },
          { name: 'feeRecipient', type: 'address' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getYesPositions',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'player', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getNoPositions',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'player', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'claimable',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'hasClaimed',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const

export const EventBetStatus = {
  Open: 0,
  Closed: 1,
  Settled: 2,
} as const

export const EventSide = {
  Yes: 0,
  No: 1,
} as const

export function eventBetStatusLabel(status: number): string {
  switch (status) {
    case EventBetStatus.Open: return 'Open for Predictions'
    case EventBetStatus.Closed: return 'Closed (Awaiting Resolution)'
    case EventBetStatus.Settled: return 'Settled'
    default: return 'Unknown'
  }
}

export const BET_POR_ABI = [
  {
    type: 'function',
    name: 'getLatestReport',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'totalBets', type: 'uint256' },
          { name: 'activeBets', type: 'uint256' },
          { name: 'settledBets', type: 'uint256' },
          { name: 'totalVolume', type: 'uint256' },
          { name: 'topPlayerProfit', type: 'uint256' },
          { name: 'isValid', type: 'bool' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'reportCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

// ── POP YES/NO AMM Prediction Market ─────────────────────────────────────

export const PREDICTION_MARKET_ABI = [
  { type: 'function', name: 'question',       inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' },
  { type: 'function', name: 'closingTime',    inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'status',         inputs: [], outputs: [{ type: 'uint8'   }], stateMutability: 'view' },
  { type: 'function', name: 'yesWins',        inputs: [], outputs: [{ type: 'bool'    }], stateMutability: 'view' },
  { type: 'function', name: 'yesId',          inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'noId',           inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'outcomeToken',   inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'lpSwapFeeBps',   inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'yesReserve',     inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'noReserve',      inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalCollateral',inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'netUsdcPerToken',inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'yesProbability', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'noProbability',  inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalLpShares',  inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'lpShares',       inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'lockedLpShares', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'lpClaimed',      inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'bool'    }], stateMutability: 'view' },
  { type: 'function', name: 'quoteYes',   inputs: [{ name: 'usdcAmount', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'quoteNo',    inputs: [{ name: 'usdcAmount', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'reasoning',   inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' },
  { type: 'function', name: 'resolver',    inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'asset',       inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' },
  { type: 'function', name: 'priceFeed',   inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'threshold',   inputs: [], outputs: [{ type: 'int256'  }], stateMutability: 'view' },
  { type: 'function', name: 'aboveWins',   inputs: [], outputs: [{ type: 'bool'    }], stateMutability: 'view' },
  { type: 'function', name: 'settledPrice',inputs: [], outputs: [{ type: 'int256'  }], stateMutability: 'view' },
  { type: 'function', name: 'buyYes',     inputs: [{ name: 'usdcAmount', type: 'uint256' }, { name: 'minYesOut', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'buyNo',      inputs: [{ name: 'usdcAmount', type: 'uint256' }, { name: 'minNoOut',  type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'addLiquidity',    inputs: [{ name: 'usdcAmount', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'removeLiquidity', inputs: [{ name: 'shares',     type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'redeem',          inputs: [{ name: 'tokenAmount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'redeemFor',       inputs: [{ name: 'player', type: 'address' }, { name: 'tokenAmount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'redeemPair',      inputs: [{ name: 'amount',     type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'redeemPairFor',   inputs: [{ name: 'player', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'resolve',    inputs: [{ name: 'yesWins_', type: 'bool' }, { name: 'reasoning_', type: 'string' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'resolveByOracle', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'claimLpPayout', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  // ── Errors ────────────────────────────────────────────────────────────────
  { type: 'error', name: 'OnlyFactory',           inputs: [] },
  { type: 'error', name: 'OnlyResolver',          inputs: [] },
  { type: 'error', name: 'MarketNotOpen',         inputs: [] },
  { type: 'error', name: 'MarketNotResolved',     inputs: [] },
  { type: 'error', name: 'TooEarlyToResolve',     inputs: [] },
  { type: 'error', name: 'AlreadyResolved',       inputs: [] },
  { type: 'error', name: 'InsufficientOutput',    inputs: [] },
  { type: 'error', name: 'AlreadyClaimed',        inputs: [] },
  { type: 'error', name: 'NotLP',                 inputs: [] },
  { type: 'error', name: 'ZeroAmount',            inputs: [] },
  { type: 'error', name: 'ZeroReserves',          inputs: [] },
  { type: 'error', name: 'OracleStale',           inputs: [] },
  { type: 'error', name: 'OraclePriceInvalid',    inputs: [] },
  { type: 'error', name: 'AlreadyInitialized',    inputs: [] },
  { type: 'error', name: 'InsufficientLpShares',  inputs: [] },
  { type: 'error', name: 'LpSharesLocked',        inputs: [] },
  // ── Events ────────────────────────────────────────────────────────────────
  {
    type: 'event',
    name: 'Resolved',
    inputs: [
      { name: 'yesWins',      type: 'bool',    indexed: false },
      { name: 'platformFee',  type: 'uint256', indexed: false },
      { name: 'creatorFee',   type: 'uint256', indexed: false },
      { name: 'reasoning',    type: 'string',  indexed: false },
      { name: 'settledPrice', type: 'int256',  indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LiquidityAdded',
    inputs: [
      { name: 'provider',   type: 'address', indexed: true  },
      { name: 'usdcAmount', type: 'uint256', indexed: false },
      { name: 'shares',     type: 'uint256', indexed: false },
      { name: 'locked',     type: 'bool',    indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LiquidityRemoved',
    inputs: [
      { name: 'provider',     type: 'address', indexed: true  },
      { name: 'sharesBurned', type: 'uint256', indexed: false },
      { name: 'usdcOut',      type: 'uint256', indexed: false },
      { name: 'yesOut',       type: 'uint256', indexed: false },
      { name: 'noOut',        type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PairRedeemed',
    inputs: [
      { name: 'user',   type: 'address', indexed: true  },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MarketInitialized',
    inputs: [
      { name: 'creator',      type: 'address', indexed: true  },
      { name: 'lpUsdc',       type: 'uint256', indexed: false },
      { name: 'lockedShares', type: 'uint256', indexed: false },
      { name: 'buyUsdc',      type: 'uint256', indexed: false },
      { name: 'initialSide',  type: 'bool',    indexed: false },
      { name: 'outcomeOut',   type: 'uint256', indexed: false },
    ],
  },
] as const

export const OUTCOME_TOKEN_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }, { name: 'id', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

export const MarketStatus = { Open: 0, Resolved: 1 } as const

export const PREDICTION_MARKET_FACTORY_ABI = [
  { type: 'error', name: 'InvalidToken',          inputs: [] },
  { type: 'error', name: 'InvalidDuration',       inputs: [] },
  { type: 'error', name: 'InitLiquidityTooLow',   inputs: [] },
  { type: 'error', name: 'MarketNotFound',        inputs: [] },
  { type: 'error', name: 'InvalidRecipient',      inputs: [] },
  { type: 'error', name: 'InvalidPriceFeed',      inputs: [] },
  { type: 'error', name: 'InvalidThreshold',      inputs: [] },
  { type: 'error', name: 'InvalidAsset',          inputs: [] },
  {
    type: 'function',
    name: 'createMarket',
    inputs: [
      {
        name: 'p',
        type: 'tuple',
        components: [
          { name: 'usdc',          type: 'address' },
          { name: 'question',      type: 'string'  },
          { name: 'closingTime',   type: 'uint256' },
          { name: 'initLiquidity', type: 'uint256' },
          { name: 'asset',         type: 'string'  },
          { name: 'priceFeed',     type: 'address' },
          { name: 'threshold',     type: 'int256'  },
          { name: 'aboveWins',     type: 'bool'    },
          { name: 'initialSide',   type: 'bool'    },
        ],
      },
    ],
    outputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'market',   type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  { type: 'function', name: 'defaultLpSwapFeeBps',   inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'defaultPlatformFeeBps', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'defaultCreatorFeeBps',  inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'minDuration',           inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'maxDuration',           inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'minInitLiquidity',      inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'settlementBot',         inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  {
    type: 'function',
    name: 'supportedTokens',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'resolveMarket',
    inputs: [
      { name: 'marketId_', type: 'uint256' },
      { name: 'yesWins',   type: 'bool' },
      { name: 'reasoning_', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setSettlementBot',
    inputs: [{ name: 'bot', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'MarketCreated',
    inputs: [
      { name: 'marketId',    type: 'uint256', indexed: true  },
      { name: 'market',      type: 'address', indexed: true  },
      { name: 'creator',     type: 'address', indexed: true  },
      { name: 'usdc',        type: 'address', indexed: false },
      { name: 'question',    type: 'string',  indexed: false },
      { name: 'closingTime', type: 'uint256', indexed: false },
      { name: 'asset',       type: 'string',  indexed: false },
      { name: 'priceFeed',   type: 'address', indexed: false },
      { name: 'threshold',   type: 'int256',  indexed: false },
      { name: 'aboveWins',   type: 'bool',    indexed: false },
      { name: 'initialSide', type: 'bool',    indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MarketResolved',
    inputs: [
      { name: 'marketId',  type: 'uint256', indexed: true  },
      { name: 'yesWins',   type: 'bool',    indexed: false },
      { name: 'reasoning', type: 'string',  indexed: false },
    ],
  },
] as const

// ── EventMarket: admin-resolved YES/NO AMM (World Cup-style sports events) ───

export const EventMarketStatus = {
  Open: 0,
  Locked: 1,
  Settled: 2,
} as const

export function eventMarketStatusLabel(status: number): string {
  switch (status) {
    case EventMarketStatus.Open: return 'Open'
    case EventMarketStatus.Locked: return 'Locked'
    case EventMarketStatus.Settled: return 'Settled'
    default: return 'Unknown'
  }
}

export const EVENT_MARKET_ABI = [
  // ── Views ─────────────────────────────────────────────────────────────────
  { type: 'function', name: 'admin',            inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'creator',          inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'platform',         inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'usdc',             inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'question',         inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' },
  { type: 'function', name: 'resolutionSource', inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' },
  { type: 'function', name: 'reasoning',        inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' },
  { type: 'function', name: 'bettingDeadline',  inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'resolveAfter',     inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'status',           inputs: [], outputs: [{ type: 'uint8'   }], stateMutability: 'view' },
  { type: 'function', name: 'yesWins',          inputs: [], outputs: [{ type: 'bool'    }], stateMutability: 'view' },
  { type: 'function', name: 'isDraw',           inputs: [], outputs: [{ type: 'bool'    }], stateMutability: 'view' },
  { type: 'function', name: 'yesReserve',       inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'noReserve',        inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalCollateral',  inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalLpShares',    inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'lpSwapFeeBps',     inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'platformFeeBps',   inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'creatorFeeBps',    inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'netUsdcPerYesToken', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'netUsdcPerNoToken',  inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'yesProbability',   inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'noProbability',    inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'yesBalanceOf',     inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'noBalanceOf',      inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'lpShares',         inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'lockedLpShares',   inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'lpClaimed',        inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'bool'    }], stateMutability: 'view' },
  { type: 'function', name: 'quoteYes',         inputs: [{ name: 'usdcAmount', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'quoteNo',          inputs: [{ name: 'usdcAmount', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'quoteSellYes',     inputs: [{ name: 'yesAmount',  type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'quoteSellNo',      inputs: [{ name: 'noAmount',   type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  // ── Writes ────────────────────────────────────────────────────────────────
  { type: 'function', name: 'buyYes',           inputs: [{ name: 'usdcAmount', type: 'uint256' }, { name: 'minYesOut', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'buyNo',            inputs: [{ name: 'usdcAmount', type: 'uint256' }, { name: 'minNoOut',  type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'sellYes',          inputs: [{ name: 'yesAmount',  type: 'uint256' }, { name: 'minUsdcOut', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'sellNo',           inputs: [{ name: 'noAmount',   type: 'uint256' }, { name: 'minUsdcOut', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'addLiquidity',     inputs: [{ name: 'usdcAmount', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'removeLiquidity',  inputs: [{ name: 'shares', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'redeemPair',       inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'lock',             inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'resolve',          inputs: [{ name: 'yesWins_', type: 'bool' }, { name: 'reasoning_', type: 'string' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'emergencyForceDraw', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'redeemYes',        inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'redeemNo',         inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'claimLpPayout',    inputs: [], outputs: [], stateMutability: 'nonpayable' },
  // ── Errors ────────────────────────────────────────────────────────────────
  { type: 'error', name: 'OnlyFactory',                inputs: [] },
  { type: 'error', name: 'OnlyAdmin',                  inputs: [] },
  { type: 'error', name: 'WrongStatus',                inputs: [] },
  { type: 'error', name: 'BettingClosed',              inputs: [] },
  { type: 'error', name: 'ResolveTooEarly',            inputs: [] },
  { type: 'error', name: 'AlreadyInitialized',         inputs: [] },
  { type: 'error', name: 'InsufficientOutput',         inputs: [] },
  { type: 'error', name: 'InsufficientLpShares',       inputs: [] },
  { type: 'error', name: 'LpSharesLocked',             inputs: [] },
  { type: 'error', name: 'AlreadyClaimed',             inputs: [] },
  { type: 'error', name: 'NotLP',                      inputs: [] },
  { type: 'error', name: 'ZeroAmount',                 inputs: [] },
  { type: 'error', name: 'ZeroReserves',               inputs: [] },
  { type: 'error', name: 'FeeTooHigh',                 inputs: [] },
  { type: 'error', name: 'InvalidDeadline',            inputs: [] },
  { type: 'error', name: 'InvalidResolveTime',         inputs: [] },
  { type: 'error', name: 'InsufficientOutcomeBalance', inputs: [] },
  { type: 'error', name: 'EmergencyTimelockNotExpired',inputs: [] },
] as const
