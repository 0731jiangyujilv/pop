export type OracleStatus = 'healthy' | 'degraded' | 'offline'

export type DataSource = 'twitter' | 'google' | 'news' | 'reddit' | 'youtube' | 'maps' | 'weather'

export type OracleNode = {
  id: string
  name: string
  emoji: string
  dataSource: DataSource
  tagline: string
  status: OracleStatus

  selfLatencyMs: number
  upstreamLatencyMs: number
  geminiLatencyMs: number

  walletAddress: string
  walletBalanceUsdc: number
  earnings24hUsdc: number
  earnings1hUsdc: number

  queries1h: number
  queries24h: number
  evidenceServed24h: number
  accuracy: number

  uptimeSec: number
  arcBlockSeen: number

  latencyHistory: number[]
  lastHeartbeatAt: number
  heartbeatIntervalMs: number

  agentTokenId?: number
  reputation?: number
  registryAddress?: string
}

export type NanoPaymentKind = 'evidence' | 'summarize' | 'verdict'

export type NanopayStatus =
  | 'received'
  | 'batched'
  | 'confirmed'
  | 'completed'
  | 'failed'

export type NanoPayment = {
  id: string
  ts: number
  oracleId: string
  oracleEmoji: string
  oracleName: string
  kind: NanoPaymentKind
  amountUsdc: number
  txHash: string
  verdict?: 'YES' | 'NO'
  confidence?: number
  // Circle Gateway batching metadata — null for legacy / self-settled rows.
  batchId?: string | null
  transferId?: string | null
  status?: NanopayStatus | null
  settlementTxHash?: string | null
  payer?: string | null
}

export type NanoPaymentUpdate = {
  id: string
  status?: NanopayStatus
  settlementTxHash?: string | null
  transferId?: string | null
}

export type SwarmAggregate = {
  onlineCount: number
  totalCount: number
  queries1h: number
  evidenceServed24h: number
  totalNanoPayments: number
  totalEarnings24hUsdc: number
  arcBlock: number
}

export type EvidenceItem = {
  id: string
  text: string
  url: string
  author?: string | null
  source: string
  timestamp: string
  /** Circle Gateway transferId for the /evidence call that fetched this item. */
  txHash?: string | null
}

export type ConsensusOracleVote = {
  oracleId: string
  dataSource: string
  emoji: string
  name: string
  verdict: 'YES' | 'NO'
  confidence: number
  verdictTxHash: string | null
  summaryTxHash: string | null
  evidenceTxHashes: string[]
  reasoning: string
  error?: string
  summary?: string | null
  /** ERC-8004 reputation delta the rule applied (+1/-1/-2). */
  reputationDelta?: number
  /** Full evidence items pulled from the oracle's /evidence endpoint. */
  evidence?: EvidenceItem[]
}

export type LatestConsensus = {
  ts: number
  question: string
  topic: string
  outcome: 'YES' | 'NO'
  spread: number
  yesWeight: number
  noWeight: number
  totalNanopayments: number
  totalSpentUsdc: number
  resolutionTxHash: string | null
  chainId: number | null
  betId: number | null
  contractAddress?: string | null
  perOracle: ConsensusOracleVote[]
}
