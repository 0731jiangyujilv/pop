import { useEffect, useRef, useState } from 'react'
import type {
  LatestConsensus,
  NanoPayment,
  NanoPaymentUpdate,
  NanopayStatus,
  OracleNode,
  SwarmAggregate,
} from '@/types/swarm'

const BOT_BASE = import.meta.env.VITE_BOT_URL ?? 'http://localhost:3000'
const STREAM_URL = `${BOT_BASE}/api/swarm/stream`

type ServerHeartbeat = {
  nodeId: string
  displayName: string
  emoji: string
  dataSource: string
  status: 'healthy' | 'degraded' | 'offline'
  selfLatencyMs: number
  upstreamLatencyMs: number
  geminiLatencyMs: number
  walletAddress: string
  walletBalanceUsdc: number
  earnings1h: number
  earnings24h: number
  queries1h: number
  queries24h: number
  evidenceServed24h: number
  accuracyVsMajority: number
  uptimeSec: number
  version: string
  timestamp: string
  receivedAt: number
  latencyHistory?: number[]
  agentTokenId?: number
  reputation?: number
  registryAddress?: string
}

type ServerNanopay = {
  id: string
  ts: number
  oracleId: string
  oracleEmoji: string
  oracleName: string
  kind: 'evidence' | 'summarize' | 'verdict'
  amountUsdc: number
  txHash: string
  verdict?: 'YES' | 'NO'
  confidence?: number
  batchId?: string | null
  transferId?: string | null
  status?: NanopayStatus | null
  settlementTxHash?: string | null
  payer?: string | null
}

type SnapshotMsg = {
  nodes: ServerHeartbeat[]
  events: ServerNanopay[]
  aggregate: {
    onlineCount: number
    totalCount: number
    queries1h: number
    evidenceServed24h: number
    totalNanoPayments: number
    totalEarnings24hUsdc: number
    ts: number
  }
  latestConsensus: LatestConsensus | null
}

const TAGLINES: Record<string, string> = {
  twitter: 'real-time social signal from X',
  google: 'web search via Custom Search API',
  news: 'global news via GDELT 2.0 Doc API',
  reddit: 'UGC discourse from subreddit feeds',
  youtube: 'video metadata + captions via YT Data API',
  maps: 'places via Gemini × Google Maps grounding',
  weather: 'conditions + forecasts via Google Weather API',
}

const HB_INTERVALS: Record<string, number> = {
  twitter: 5000,
  google: 7000,
  news: 8000,
  reddit: 6000,
  youtube: 9000,
  maps: 7500,
  weather: 6500,
}

const MAX_EVENTS = 100

function toOracleNode(hb: ServerHeartbeat, history: number[]): OracleNode {
  return {
    id: hb.nodeId,
    name: hb.displayName,
    emoji: hb.emoji,
    dataSource: hb.dataSource as OracleNode['dataSource'],
    tagline: TAGLINES[hb.dataSource] ?? '',
    status: hb.status,
    selfLatencyMs: hb.selfLatencyMs,
    upstreamLatencyMs: hb.upstreamLatencyMs,
    geminiLatencyMs: hb.geminiLatencyMs,
    walletAddress: hb.walletAddress,
    walletBalanceUsdc: hb.walletBalanceUsdc,
    earnings24hUsdc: hb.earnings24h,
    earnings1hUsdc: hb.earnings1h,
    queries1h: hb.queries1h,
    queries24h: hb.queries24h,
    evidenceServed24h: hb.evidenceServed24h,
    accuracy: hb.accuracyVsMajority,
    uptimeSec: hb.uptimeSec,
    arcBlockSeen: 0,
    latencyHistory: history.length > 0 ? history : [hb.selfLatencyMs],
    lastHeartbeatAt: hb.receivedAt ?? Date.now(),
    heartbeatIntervalMs: HB_INTERVALS[hb.dataSource] ?? 7000,
    agentTokenId: hb.agentTokenId,
    reputation: hb.reputation,
    registryAddress: hb.registryAddress,
  }
}

function toNanoPayment(ev: ServerNanopay): NanoPayment {
  return {
    id: ev.id,
    ts: ev.ts,
    oracleId: ev.oracleId,
    oracleEmoji: ev.oracleEmoji,
    oracleName: ev.oracleName,
    kind: ev.kind,
    amountUsdc: ev.amountUsdc,
    txHash: ev.txHash,
    verdict: ev.verdict,
    confidence: ev.confidence,
    batchId: ev.batchId ?? null,
    transferId: ev.transferId ?? null,
    status: ev.status ?? null,
    settlementTxHash: ev.settlementTxHash ?? null,
    payer: ev.payer ?? null,
  }
}

export function useSwarmSse() {
  const [nodes, setNodes] = useState<OracleNode[]>([])
  const [events, setEvents] = useState<NanoPayment[]>([])
  const [pulseTick, setPulseTick] = useState<{ nodeId: string; at: number } | null>(null)
  const [aggregate, setAggregate] = useState<SwarmAggregate>({
    onlineCount: 0,
    totalCount: 0,
    queries1h: 0,
    evidenceServed24h: 0,
    totalNanoPayments: 0,
    totalEarnings24hUsdc: 0,
    arcBlock: 0,
  })
  const [connected, setConnected] = useState(false)
  const [latestConsensus, setLatestConsensus] = useState<LatestConsensus | null>(null)
  const histories = useRef<Map<string, number[]>>(new Map())

  useEffect(() => {
    const es = new EventSource(STREAM_URL)

    es.addEventListener('open', () => setConnected(true))
    es.addEventListener('error', () => setConnected(false))

    es.addEventListener('snapshot', (e: MessageEvent) => {
      const snap = JSON.parse(e.data) as SnapshotMsg
      histories.current = new Map(snap.nodes.map((n) => [n.nodeId, n.latencyHistory ?? []]))
      setNodes(snap.nodes.map((n) => toOracleNode(n, n.latencyHistory ?? [])))
      setEvents(snap.events.map(toNanoPayment))
      setAggregate({
        onlineCount: snap.aggregate.onlineCount,
        totalCount: snap.aggregate.totalCount,
        queries1h: snap.aggregate.queries1h,
        evidenceServed24h: snap.aggregate.evidenceServed24h,
        totalNanoPayments: snap.aggregate.totalNanoPayments,
        totalEarnings24hUsdc: snap.aggregate.totalEarnings24hUsdc,
        arcBlock: 0,
      })
      setLatestConsensus(snap.latestConsensus ?? null)
    })

    es.addEventListener('consensus', (e: MessageEvent) => {
      setLatestConsensus(JSON.parse(e.data) as LatestConsensus)
    })

    es.addEventListener('heartbeat', (e: MessageEvent) => {
      const { node, history } = JSON.parse(e.data) as { node: ServerHeartbeat; history: number[] }
      histories.current.set(node.nodeId, history)
      setNodes((curr) => {
        const mapped = toOracleNode(node, history)
        const idx = curr.findIndex((c) => c.id === node.nodeId)
        if (idx < 0) return [...curr, mapped]
        const next = curr.slice()
        next[idx] = mapped
        return next
      })
      setPulseTick({ nodeId: node.nodeId, at: Date.now() })
      setAggregate((a) => ({
        ...a,
        onlineCount: 0,
        totalCount: 0,
      }))
    })

    es.addEventListener('nanopay', (e: MessageEvent) => {
      const np = JSON.parse(e.data) as ServerNanopay
      setEvents((curr) => [toNanoPayment(np), ...curr].slice(0, MAX_EVENTS))
      setAggregate((a) => ({
        ...a,
        totalNanoPayments: a.totalNanoPayments + 1,
        totalEarnings24hUsdc: a.totalEarnings24hUsdc + np.amountUsdc,
      }))
    })

    es.addEventListener('nanopay-update', (e: MessageEvent) => {
      const u = JSON.parse(e.data) as NanoPaymentUpdate
      setEvents((curr) =>
        curr.map((ev) =>
          ev.id === u.id
            ? {
                ...ev,
                status: u.status ?? ev.status,
                settlementTxHash:
                  u.settlementTxHash !== undefined ? u.settlementTxHash : ev.settlementTxHash,
                transferId: u.transferId !== undefined ? u.transferId : ev.transferId,
              }
            : ev,
        ),
      )
    })

    return () => es.close()
  }, [])

  // Recompute aggregate online count from nodes list
  useEffect(() => {
    setAggregate((a) => ({
      ...a,
      onlineCount: nodes.filter((n) => n.status !== 'offline').length,
      totalCount: nodes.length,
      queries1h: nodes.reduce((s, n) => s + n.queries1h, 0),
      evidenceServed24h: nodes.reduce((s, n) => s + n.evidenceServed24h, 0),
    }))
  }, [nodes])

  return { nodes, events, pulseTick, aggregate, connected, latestConsensus }
}
