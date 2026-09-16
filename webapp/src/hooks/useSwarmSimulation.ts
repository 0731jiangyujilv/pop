import { useEffect, useRef, useState, useCallback } from 'react'
import type { OracleNode, NanoPayment, SwarmAggregate, NanoPaymentKind } from '@/types/swarm'

const HISTORY_LEN = 40
const MAX_EVENTS = 50

const INITIAL_NODES: OracleNode[] = [
  {
    id: 'oracle-twitter-01',
    name: 'Twitter Scout',
    emoji: '🐦',
    dataSource: 'twitter',
    tagline: 'real-time social signal from X',
    status: 'healthy',
    selfLatencyMs: 142,
    upstreamLatencyMs: 98,
    geminiLatencyMs: 612,
    walletAddress: '0x4a2c8b9f7e3d1a5c2b0f8e7d6a9c4b2f8f2c',
    walletBalanceUsdc: 0.245,
    earnings24hUsdc: 0.0245,
    earnings1hUsdc: 0.00312,
    queries1h: 43,
    queries24h: 872,
    evidenceServed24h: 4360,
    accuracy: 0.94,
    uptimeSec: 8040,
    arcBlockSeen: 4892103,
    latencyHistory: Array.from({ length: HISTORY_LEN }, () => 120 + Math.random() * 60),
    lastHeartbeatAt: Date.now(),
    heartbeatIntervalMs: 5000,
  },
  {
    id: 'oracle-google-02',
    name: 'Google Indexer',
    emoji: '🔎',
    dataSource: 'google',
    tagline: 'web search via Custom Search API',
    status: 'healthy',
    selfLatencyMs: 89,
    upstreamLatencyMs: 64,
    geminiLatencyMs: 534,
    walletAddress: '0x9131ab73ef21d9c4f8b2a7e6d8c3f1a937ed',
    walletBalanceUsdc: 0.312,
    earnings24hUsdc: 0.0312,
    earnings1hUsdc: 0.00445,
    queries1h: 52,
    queries24h: 1040,
    evidenceServed24h: 5200,
    accuracy: 0.88,
    uptimeSec: 14520,
    arcBlockSeen: 4892103,
    latencyHistory: Array.from({ length: HISTORY_LEN }, () => 75 + Math.random() * 30),
    lastHeartbeatAt: Date.now(),
    heartbeatIntervalMs: 7000,
  },
  {
    id: 'oracle-news-03',
    name: 'GDELT Sentinel',
    emoji: '📰',
    dataSource: 'news',
    tagline: 'global news via GDELT 2.0 Doc API',
    status: 'degraded',
    selfLatencyMs: 812,
    upstreamLatencyMs: 620,
    geminiLatencyMs: 701,
    walletAddress: '0x7dab42ef8c0a15b9d6e4f3c281bfa92c104',
    walletBalanceUsdc: 0.198,
    earnings24hUsdc: 0.0198,
    earnings1hUsdc: 0.00172,
    queries1h: 29,
    queries24h: 582,
    evidenceServed24h: 2910,
    accuracy: 0.71,
    uptimeSec: 1320,
    arcBlockSeen: 4892102,
    latencyHistory: Array.from({ length: HISTORY_LEN }, () => 500 + Math.random() * 400),
    lastHeartbeatAt: Date.now(),
    heartbeatIntervalMs: 8000,
  },
  {
    id: 'oracle-reddit-04',
    name: 'Reddit Watcher',
    emoji: '👽',
    dataSource: 'reddit',
    tagline: 'UGC discourse from subreddit feeds',
    status: 'healthy',
    selfLatencyMs: 234,
    upstreamLatencyMs: 178,
    geminiLatencyMs: 588,
    walletAddress: '0x5c92f1e84bd30a7c9f2e5b8d4a1c6f8e9273',
    walletBalanceUsdc: 0.178,
    earnings24hUsdc: 0.01780,
    earnings1hUsdc: 0.00223,
    queries1h: 34,
    queries24h: 681,
    evidenceServed24h: 3405,
    accuracy: 0.82,
    uptimeSec: 6300,
    arcBlockSeen: 4892103,
    latencyHistory: Array.from({ length: HISTORY_LEN }, () => 200 + Math.random() * 80),
    lastHeartbeatAt: Date.now(),
    heartbeatIntervalMs: 6000,
  },
  {
    id: 'oracle-youtube-05',
    name: 'YouTube Probe',
    emoji: '📺',
    dataSource: 'youtube',
    tagline: 'video metadata + captions via YT Data API',
    status: 'healthy',
    selfLatencyMs: 310,
    upstreamLatencyMs: 245,
    geminiLatencyMs: 672,
    walletAddress: '0x3f08ac62d9b1e7f5c8a4b3d2f1e6c9a83a1b',
    walletBalanceUsdc: 0.092,
    earnings24hUsdc: 0.00920,
    earnings1hUsdc: 0.00108,
    queries1h: 14,
    queries24h: 281,
    evidenceServed24h: 1405,
    accuracy: 0.79,
    uptimeSec: 9400,
    arcBlockSeen: 4892103,
    latencyHistory: Array.from({ length: HISTORY_LEN }, () => 280 + Math.random() * 90),
    lastHeartbeatAt: Date.now(),
    heartbeatIntervalMs: 9000,
  },
]

const KIND_PRICE: Record<NanoPaymentKind, number> = {
  evidence: 0.001,
  summarize: 0.003,
  verdict: 0.005,
}

const KIND_WEIGHTS: Array<[NanoPaymentKind, number]> = [
  ['evidence', 0.78],
  ['summarize', 0.14],
  ['verdict', 0.08],
]

function pickKind(): NanoPaymentKind {
  const r = Math.random()
  let cum = 0
  for (const [k, w] of KIND_WEIGHTS) {
    cum += w
    if (r < cum) return k
  }
  return 'evidence'
}

function randHex(n: number): string {
  const hex = '0123456789abcdef'
  let out = '0x'
  for (let i = 0; i < n; i++) out += hex[Math.floor(Math.random() * 16)]
  return out
}

function clampStatusFromLatency(lat: number, forced?: 'offline'): 'healthy' | 'degraded' | 'offline' {
  if (forced) return forced
  if (lat > 700) return 'degraded'
  return 'healthy'
}

export function useSwarmSimulation() {
  const [nodes, setNodes] = useState<OracleNode[]>(INITIAL_NODES)
  const [events, setEvents] = useState<NanoPayment[]>([])
  const [pulseTick, setPulseTick] = useState<{ nodeId: string; at: number } | null>(null)
  const [killed, setKilled] = useState<Set<string>>(new Set())
  const [arcBlock, setArcBlock] = useState(4892103)
  const [totalNanoPayments, setTotalNanoPayments] = useState(1247)
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  // Per-node heartbeat
  useEffect(() => {
    const timers = INITIAL_NODES.map((n) => {
      const tick = () => {
        const nodeId = n.id
        const isKilled = killed.has(nodeId)
        setNodes((curr) =>
          curr.map((node) => {
            if (node.id !== nodeId) return node
            if (isKilled) {
              return {
                ...node,
                status: 'offline',
                selfLatencyMs: 0,
                upstreamLatencyMs: 0,
                geminiLatencyMs: 0,
                latencyHistory: [...node.latencyHistory.slice(1), 0],
              }
            }
            const baseSelf = node.dataSource === 'news' ? 600 : node.dataSource === 'youtube' ? 290 : 150
            const jitter = (Math.random() - 0.5) * 120
            const degradeSpike = Math.random() < 0.04 ? 400 : 0
            const self = Math.max(30, baseSelf + jitter + degradeSpike)
            const upstream = Math.max(20, self * 0.7 + (Math.random() - 0.5) * 50)
            const gemini = 500 + Math.random() * 300
            const status = clampStatusFromLatency(self)

            const earningsDelta = (Math.random() * 0.0005) + 0.0001
            const queriesDelta = Math.random() < 0.6 ? 1 : 0
            const evidenceDelta = Math.random() < 0.8 ? Math.floor(Math.random() * 4) : 0

            return {
              ...node,
              selfLatencyMs: self,
              upstreamLatencyMs: upstream,
              geminiLatencyMs: gemini,
              status,
              latencyHistory: [...node.latencyHistory.slice(1), self],
              earnings24hUsdc: node.earnings24hUsdc + earningsDelta,
              earnings1hUsdc: node.earnings1hUsdc + earningsDelta * 0.4,
              walletBalanceUsdc: node.walletBalanceUsdc + earningsDelta,
              queries1h: node.queries1h + queriesDelta,
              queries24h: node.queries24h + queriesDelta,
              evidenceServed24h: node.evidenceServed24h + evidenceDelta,
              uptimeSec: node.uptimeSec + n.heartbeatIntervalMs / 1000,
              lastHeartbeatAt: Date.now(),
              arcBlockSeen: node.arcBlockSeen + Math.floor(Math.random() * 3),
            }
          })
        )
        if (!isKilled) setPulseTick({ nodeId, at: Date.now() })
      }
      return window.setInterval(tick, n.heartbeatIntervalMs)
    })
    return () => timers.forEach(clearInterval)
  }, [killed])

  // Nanopayment event stream (independent of heartbeat)
  useEffect(() => {
    const id = window.setInterval(() => {
      const live = nodesRef.current.filter((n) => n.status !== 'offline')
      if (live.length === 0) return
      const picked = live[Math.floor(Math.random() * live.length)]
      const kind = pickKind()
      const amount = KIND_PRICE[kind]
      const verdict: 'YES' | 'NO' | undefined = kind === 'verdict' ? (Math.random() > 0.5 ? 'YES' : 'NO') : undefined
      const confidence = kind === 'verdict' ? 0.55 + Math.random() * 0.4 : undefined
      const ev: NanoPayment = {
        id: `np-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: Date.now(),
        oracleId: picked.id,
        oracleEmoji: picked.emoji,
        oracleName: picked.name,
        kind,
        amountUsdc: amount,
        txHash: randHex(16),
        verdict,
        confidence,
      }
      setEvents((curr) => [ev, ...curr].slice(0, MAX_EVENTS))
      setTotalNanoPayments((n) => n + 1)
    }, 700 + Math.random() * 600)
    return () => clearInterval(id)
  }, [])

  // Arc block number tick
  useEffect(() => {
    const id = window.setInterval(() => {
      setArcBlock((b) => b + 1 + Math.floor(Math.random() * 2))
    }, 1200)
    return () => clearInterval(id)
  }, [])

  const toggleKill = useCallback((nodeId: string) => {
    setKilled((curr) => {
      const next = new Set(curr)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])

  const aggregate: SwarmAggregate = {
    onlineCount: nodes.filter((n) => n.status !== 'offline').length,
    totalCount: nodes.length,
    queries1h: nodes.reduce((a, n) => a + n.queries1h, 0),
    evidenceServed24h: nodes.reduce((a, n) => a + n.evidenceServed24h, 0),
    totalNanoPayments,
    totalEarnings24hUsdc: nodes.reduce((a, n) => a + n.earnings24hUsdc, 0),
    arcBlock,
  }

  return { nodes, events, pulseTick, aggregate, toggleKill, killed }
}
