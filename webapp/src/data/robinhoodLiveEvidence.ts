/**
 * Immutable live-demo evidence for the Robinhood Chain OddsShift submission.
 *
 * Source of truth: `submission-evidence/` (lifecycle, deployment, receipts).
 * Historical scenario narration MUST use these values — never invent history
 * from the current RPC snapshot.
 *
 * Kept free of `@/` path aliases so Node's test runner can import it directly.
 */
export type EvidenceGroupId = 'deployment' | 'fair' | 'toxic' | 'settlement'

export type HexAddress = `0x${string}`
export type HexHash = `0x${string}`

export type EvidenceTx = {
  id: string
  group: EvidenceGroupId
  action: string
  hash: HexHash
  /** Short semantic result shown in the evidence table. */
  result: string
  /** Optional global trade index when the row is a market trade. */
  tradeIndex?: number
  highlight?: 'shock' | 'correction' | 'rebate' | 'resolution' | 'payout'
}

export type ProbPoint = {
  percent: number
  label?: string
}

export type ScenarioMarker = {
  afterPercent: number
  kind: 'shock' | 'reverted' | 'sustained'
  label: string
}

export const LIVE_MARKET = {
  chainId: 46_630,
  networkName: 'Robinhood Chain Testnet',
  explorerUrl: 'https://explorer.testnet.chain.robinhood.com',
  marketAddress: '0x4F946Cca7f8da191168f76Fe12fbD6cfa1CAA26e' as HexAddress,
  usdgAddress: '0x7E955252E15c84f5768B83c41a71F9eba181802F' as HexAddress,
  deployerAddress: '0xA5B709025224bA08B8eFfF1b0D1d28E970A34Cf3' as HexAddress,
  question: 'Will BTC close above $100k this week?',
  collateralSymbol: 'USDG',
  collateralName: 'Paxos USDG',
  initialLiquidityUsdg: '100',
  initialProbabilityPercent: 50,
  finalProbabilityPercent: 68.5,
  statusLabel: 'Settled demo evidence · zero pending liabilities',
} as const

export const LIVE_PARAMETERS = {
  baseFeeBps: 30,
  protectionFeeBps: 70,
  totalFeeBps: 100,
  jumpThresholdPoints: 5,
  lookbackTrades: 5,
  observeWindowTrades: 5,
  contributionThresholdPoints: 1,
  staleCooldownSeconds: 120,
} as const

/** Final accounting captured after the live demo (USDG, 6 decimals display). */
export const LIVE_ACCOUNTING = {
  totalTrades: 20,
  resolvedTrades: 20,
  pendingTrades: 0,
  totalShocks: 4,
  openShock: false,
  pendingEscrowUsdg: '0',
  traderRebatesOwedUsdg: '0',
  lpRewardsOwedUsdg: '0',
  protectionRefundedUsdg: '0.251299',
  toxicProtectionToLpsUsdg: '0.284252',
  baseFeesToLpsUsdg: '0.229516',
  totalLpPayoutUsdg: '0.513768',
  fairInitialRebateUsdg: '0.199946',
  fairRemainingRebateUsdg: '0.051353',
  finalWalletBalanceUsdg: '24.256125',
} as const

export const LIVE_VERIFICATION = {
  sourcifyVerificationId: 'e81be92a-9950-4d1e-a453-753456c39434',
  match: 'exact_match' as const,
  creationMatch: 'exact_match' as const,
  runtimeMatch: 'exact_match' as const,
  compiler: '0.8.24+commit.e11b9ed9',
  optimizerEnabled: true,
  optimizerRuns: 200,
  evmVersion: 'cancun',
  viaIR: true,
  metadataBytecodeHash: 'ipfs',
  /** Sourcify succeeded; Blockscout downstream forwarding did not. */
  blockscoutForwarding: 'Fail - Unable to verify' as const,
  foundryTestsPassing: 133,
  runtimeBytecodeBytes: 24_396,
  slitherGate: 'release gate passed with reviewed/accepted findings',
} as const

export const FAIR_PROBABILITY_PATH: readonly ProbPoint[] = [
  { percent: 50.0 },
  { percent: 51.4 },
  { percent: 52.8 },
  { percent: 54.2 },
  { percent: 55.6 },
  { percent: 57.0, label: 'Shock detected' },
  { percent: 49.99, label: 'Reverted' },
]

export const FAIR_TAIL_PATH: readonly ProbPoint[] = [
  { percent: 49.99 },
  { percent: 50.87 },
  { percent: 51.75 },
  { percent: 52.62 },
  { percent: 53.5 },
]

export const FAIR_MARKERS: readonly ScenarioMarker[] = [
  { afterPercent: 57.0, kind: 'shock', label: 'SHOCK DETECTED' },
  { afterPercent: 49.99, kind: 'reverted', label: 'REVERTED' },
]

export const TOXIC_PROBABILITY_PATH: readonly ProbPoint[] = [
  { percent: 53.5 },
  { percent: 55.0 },
  { percent: 56.5 },
  { percent: 58.0 },
  { percent: 59.5 },
  { percent: 61.0 },
  { percent: 62.5 },
  { percent: 64.0 },
  { percent: 65.5 },
  { percent: 67.0 },
  { percent: 68.5, label: 'Sustained' },
]

export const TOXIC_MARKERS: readonly ScenarioMarker[] = [
  { afterPercent: 68.5, kind: 'sustained', label: 'SUSTAINED REPRICING' },
]

export const DEPLOYMENT_TXS = {
  deploy: '0x6b3a39b82ea54c166694687df30bf47523c072658d22f45a40b2d77cda61e5ab',
  fund: '0xc45b2b28aa611f85b7a7f14d89c65b382562b1bc1625b77b54a5d9199a2e97bf',
  initialize: '0x62f5587301c9f9d08ecf3b8d3e9115692208a4f048b1673f011b3516fce2cb5a',
} as const

export const FAIR_TXS = {
  trades: [
    '0x9d64267ed7182103d05f4b770b7e3c23b313c91a2715906d330b6b178e96ae47',
    '0x48ab05769f5f496e55d68805475929db4a1f1d358674978d4d3c90c07782d51d',
    '0x696e07c2a04b92ba61f1a46894fcbf254c493a8f44e7d5f84026ff8a87de0c7d',
    '0x2409306882174ee57a9c1b98ea04fc216f467ef423171d44e002ab544faca9d3',
    '0x0c3f6abb3db4415f9d628a135a2451aa87429a06d4ba852d0d462409ef73f0b2',
    '0x415e1e5b638aeb72be33f1bf377a19b8b8d23e5fcff02e41a90567c665d91120',
    '0xf049190f75ef8d13964c1de4a0b4ab85dc629a627ef11e710ab844641a8c0529',
    '0xd52190999e86f67c9e1de4dab1d74be81d22c3de38dc8494acaaa4aab8344cdb',
    '0xd92831539015fa1a736319d7a4fe81069e7555c77cd0c3ae4a7e1214e866e9d5',
    '0xea7524edcefdf130b14012cc25c6aa285f61a2b58ff046afa9cd175def9ae139',
  ],
  shock: '0x0c3f6abb3db4415f9d628a135a2451aa87429a06d4ba852d0d462409ef73f0b2',
  correction: '0x415e1e5b638aeb72be33f1bf377a19b8b8d23e5fcff02e41a90567c665d91120',
  initialRebate: '0x0bd60b54ea200960fc3c8562514269d7bdaf60fb0e2a7e2dfa802717e047196b',
} as const

export const TOXIC_TXS = {
  trades: [
    '0x59de7a2e13ea6c31e2d17a1f10a92d989cf33f2721f089de803cb4b1b9214ac1',
    '0x9c536cea480ec52d3a9de1e038bfc09b8fb4d04b9cade6e82816f3ca896a3d2c',
    '0x78acb7b975a5d8ae46aa8b0795e89f88cab1b84375a0963b3a46d320f42b574b',
    '0x592b35a703c0797995151b20b832ab17da4b4e581587cf5de73e4c225aed6c23',
    '0xe769f428dfb638e59ad3083008a7b4f1e1e5bf5f265687a31d5701a8adaf70cc',
    '0x17ba72f2c6197b2fae53bc34f9d545b642adb995c7becf8fc37b9cf6b518cce7',
    '0xa1dc79d62f5d6b658ae350106bb642a34b3fcd22fc12e6dba6df00214014c35b',
    '0xcd7d0168088ca570b71dc3da8a2e5a53fb9ee4889a37cb746bede5912f97276a',
    '0xa348cb051609a19b7599d5b50bb3cf754b5db4f71e830ca4ff50e1d9f5c8829a',
    '0x3d4620bac06d8e611afc8dc610aebfd55152ec783b2e912fdce302584460f17f',
  ],
  finalToxic: '0x3d4620bac06d8e611afc8dc610aebfd55152ec783b2e912fdce302584460f17f',
  resolveStale: '0x10813fe5cd67cff9129b561a8920b8a8e6f9b7ea7a927108b0e69cdec76f14fd',
} as const

export const SETTLEMENT_TXS = {
  resolveStale: TOXIC_TXS.resolveStale,
  finalRebate: '0x1578e57cd947fb4874bc88426e660d0c7fa7042d37be7b64a34148054e6c56a2',
  lpRewardClaim: '0x771d15fe70c65ff6a85413ece57a8193475a9e7f11d85275cd96e2754c778685',
} as const

const FAIR_TRADE_RESULTS: readonly string[] = [
  '50.00 → 51.40',
  '51.40 → 52.80',
  '52.80 → 54.20',
  '54.20 → 55.60',
  '55.60 → 57.00 · shock mark',
  '57.00 → 49.99 · correction',
  '49.99 → 50.87 · sub-threshold',
  '50.87 → 51.75 · sub-threshold',
  '51.75 → 52.62 · sub-threshold',
  '52.62 → 53.50 · sub-threshold',
]

const TOXIC_TRADE_RESULTS: readonly string[] = [
  '53.50 → 55.00',
  '55.00 → 56.50',
  '56.50 → 58.00',
  '58.00 → 59.50',
  '59.50 → 61.00',
  '61.00 → 62.50',
  '62.50 → 64.00',
  '64.00 → 65.50',
  '65.50 → 67.00',
  '67.00 → 68.50 · sustained',
]

function tradeEvidence(
  group: 'fair' | 'toxic',
  hashes: readonly string[],
  results: readonly string[],
  indexOffset: number,
): EvidenceTx[] {
  return hashes.map((hash, i) => {
    const tradeIndex = indexOffset + i
    const isShock = hash === FAIR_TXS.shock
    const isCorrection = hash === FAIR_TXS.correction
    const isFinalToxic = hash === TOXIC_TXS.finalToxic
    return {
      id: `${group}-trade-${tradeIndex}`,
      group,
      action: `Trade #${tradeIndex}`,
      hash: hash as `0x${string}`,
      result: results[i] ?? '',
      tradeIndex,
      highlight: isShock
        ? 'shock'
        : isCorrection
          ? 'correction'
          : isFinalToxic
            ? 'resolution'
            : undefined,
    }
  })
}

/** Structured on-chain evidence rows for the expandable drawer. */
export const EVIDENCE_TXS: readonly EvidenceTx[] = [
  {
    id: 'deploy',
    group: 'deployment',
    action: 'Deploy EventMarketV2',
    hash: DEPLOYMENT_TXS.deploy,
    result: 'Contract created',
  },
  {
    id: 'fund',
    group: 'deployment',
    action: 'Fund with 100 USDG',
    hash: DEPLOYMENT_TXS.fund,
    result: 'Seed liquidity transferred',
  },
  {
    id: 'initialize',
    group: 'deployment',
    action: 'Initialize market',
    hash: DEPLOYMENT_TXS.initialize,
    result: '50.00% · open for trading',
  },
  ...tradeEvidence('fair', FAIR_TXS.trades, FAIR_TRADE_RESULTS, 0),
  {
    id: 'fair-rebate',
    group: 'fair',
    action: 'Initial FAIR rebate claim',
    hash: FAIR_TXS.initialRebate,
    result: `${LIVE_ACCOUNTING.fairInitialRebateUsdg} USDG refunded`,
    highlight: 'rebate',
  },
  ...tradeEvidence('toxic', TOXIC_TXS.trades, TOXIC_TRADE_RESULTS, 10),
  {
    id: 'resolve-stale',
    group: 'settlement',
    action: 'Permissionless resolveStale',
    hash: SETTLEMENT_TXS.resolveStale,
    result: 'Queue finalized · 0 pending',
    highlight: 'resolution',
  },
  {
    id: 'final-rebate',
    group: 'settlement',
    action: 'Remaining rebate claim',
    hash: SETTLEMENT_TXS.finalRebate,
    result: `${LIVE_ACCOUNTING.fairRemainingRebateUsdg} USDG refunded`,
    highlight: 'rebate',
  },
  {
    id: 'lp-reward',
    group: 'settlement',
    action: 'LP reward claim',
    hash: SETTLEMENT_TXS.lpRewardClaim,
    result: `${LIVE_ACCOUNTING.totalLpPayoutUsdg} USDG to LPs`,
    highlight: 'payout',
  },
]

export const EVIDENCE_GROUPS: readonly {
  id: EvidenceGroupId
  title: string
  description: string
}[] = [
  {
    id: 'deployment',
    title: 'DEPLOYMENT',
    description: 'Contract creation, USDG funding, and market initialization.',
  },
  {
    id: 'fair',
    title: 'FAIR',
    description: 'Transient repricing, shock mark, correction, and protection refund.',
  },
  {
    id: 'toxic',
    title: 'TOXIC',
    description: 'Sustained causative repricing and protection transfer to LPs.',
  },
  {
    id: 'settlement',
    title: 'SETTLEMENT',
    description: 'Permissionless stale resolution and final payouts.',
  },
]

export function evidenceByGroup(group: EvidenceGroupId): EvidenceTx[] {
  return EVIDENCE_TXS.filter((tx) => tx.group === group)
}

export function evidenceExplorerUrl(tx: EvidenceTx | { hash: string }): string {
  return `${LIVE_MARKET.explorerUrl.replace(/\/$/, '')}/tx/${tx.hash}`
}

export function isZeroLiability(accounting = LIVE_ACCOUNTING): boolean {
  return (
    accounting.pendingTrades === 0 &&
    accounting.pendingEscrowUsdg === '0' &&
    accounting.traderRebatesOwedUsdg === '0' &&
    accounting.lpRewardsOwedUsdg === '0' &&
    accounting.openShock === false
  )
}

export function formatPercent(value: number, digits = 2): string {
  return `${value.toFixed(digits)}%`
}

export function formatUsdg(value: string): string {
  return `${value} USDG`
}

/** Assert every configured hash is a 32-byte hex string. */
export function assertEvidenceIntegrity(
  market: string = LIVE_MARKET.marketAddress,
): {
  ok: true
  txCount: number
} {
  if (market.toLowerCase() !== LIVE_MARKET.marketAddress.toLowerCase()) {
    throw new Error('Live evidence market address mismatch')
  }
  const HASH = /^0x[0-9a-fA-F]{64}$/
  for (const tx of EVIDENCE_TXS) {
    if (!HASH.test(tx.hash)) throw new Error(`Invalid evidence hash: ${tx.id}`)
  }
  if (FAIR_TXS.trades.length !== 10) throw new Error('FAIR trade count mismatch')
  if (TOXIC_TXS.trades.length !== 10) throw new Error('TOXIC trade count mismatch')
  if (FAIR_TXS.trades[4] !== FAIR_TXS.shock) throw new Error('FAIR shock hash mismatch')
  if (FAIR_TXS.trades[5] !== FAIR_TXS.correction) throw new Error('FAIR correction hash mismatch')
  if (TOXIC_TXS.trades[9] !== TOXIC_TXS.finalToxic) throw new Error('TOXIC final hash mismatch')
  return { ok: true, txCount: EVIDENCE_TXS.length }
}
