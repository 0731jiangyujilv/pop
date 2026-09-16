import type { Response } from "express"
import { Prisma } from "@prisma/client"
import { prisma } from "../db"

export type NanopayStatus =
  | "received"
  | "batched"
  | "confirmed"
  | "completed"
  | "failed"

export type NanopayEvent = {
  id: string
  ts: number
  oracleId: string
  oracleEmoji: string
  oracleName: string
  kind: "evidence" | "summarize" | "verdict"
  amountUsdc: number
  txHash: string
  verdict?: "YES" | "NO"
  confidence?: number
  // Circle Gateway batching metadata (null for legacy/self-settled rows).
  batchId?: string | null
  transferId?: string | null
  status?: NanopayStatus | null
  settlementTxHash?: string | null
  payer?: string | null
}

export type NanopayUpdate = {
  id: string
  status?: NanopayStatus
  settlementTxHash?: string | null
  transferId?: string | null
}

export type EvidenceItemPayload = {
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
  verdict: "YES" | "NO"
  confidence: number
  verdictTxHash: string | null
  summaryTxHash: string | null
  evidenceTxHashes: string[]
  reasoning: string
  error?: string
  /** Per-oracle Gemini summary text. Null when summarize call failed/was skipped. */
  summary?: string | null
  /** ERC-8004 reputation delta the rule applied for this oracle (+1/-1/-2). */
  reputationDelta?: number
  /** Full evidence items returned by this oracle's /evidence calls. */
  evidence?: EvidenceItemPayload[]
}

export type LatestConsensus = {
  ts: number
  question: string
  topic: string
  outcome: "YES" | "NO"
  spread: number
  yesWeight: number
  noWeight: number
  totalNanopayments: number
  totalSpentUsdc: number
  resolutionTxHash: string | null
  chainId: number | null
  betId: number | null
  contractAddress: string | null
  perOracle: ConsensusOracleVote[]
}

export type Heartbeat = {
  nodeId: string
  displayName: string
  emoji: string
  dataSource: string
  status: "healthy" | "degraded" | "offline"
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
  agentTokenId?: number
  reputation?: number
  registryAddress?: string
}

const HISTORY_LEN = 120
const OFFLINE_AFTER_MS = 30_000
const EVENTS_RING = 200
const SNAPSHOT_EVENT_TAIL = 50

const latest = new Map<string, Heartbeat>()
const latencyHistory = new Map<string, number[]>()
const recentEvents: NanopayEvent[] = []
let totalNanoPayments = 0
let latestConsensus: LatestConsensus | null = null
const subscribers = new Set<Response>()

function pushHistory(nodeId: string, value: number) {
  const arr = latencyHistory.get(nodeId) ?? []
  arr.push(value)
  if (arr.length > HISTORY_LEN) arr.shift()
  latencyHistory.set(nodeId, arr)
}

function broadcast(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const sub of subscribers) {
    try {
      sub.write(payload)
    } catch {
      subscribers.delete(sub)
    }
  }
}

export function recordHeartbeat(hb: Omit<Heartbeat, "receivedAt">) {
  const enriched: Heartbeat = { ...hb, receivedAt: Date.now() }
  latest.set(hb.nodeId, enriched)
  pushHistory(hb.nodeId, hb.selfLatencyMs)
  broadcast("heartbeat", { node: enriched, history: latencyHistory.get(hb.nodeId) ?? [] })
}

export function recordNanopay(ev: Omit<NanopayEvent, "ts"> & { ts?: number }) {
  const full: NanopayEvent = {
    ...ev,
    ts: ev.ts ?? Date.now(),
    status: ev.status ?? "received",
  }
  recentEvents.unshift(full)
  if (recentEvents.length > EVENTS_RING) recentEvents.pop()
  totalNanoPayments += 1
  broadcast("nanopay", full)

  // Persist (fire-and-forget). Dedupe on id so oracle retries don't duplicate.
  prisma.swarmNanopay
    .upsert({
      where: { id: full.id },
      create: {
        id: full.id,
        ts: new Date(full.ts),
        oracleId: full.oracleId,
        oracleEmoji: full.oracleEmoji,
        oracleName: full.oracleName,
        kind: full.kind,
        amountUsdc: new Prisma.Decimal(full.amountUsdc),
        txHash: full.txHash,
        verdict: full.verdict ?? null,
        confidence: full.confidence ?? null,
        batchId: full.batchId ?? null,
        transferId: full.transferId ?? null,
        status: full.status ?? "received",
        settlementTxHash: full.settlementTxHash ?? null,
        payer: full.payer ?? null,
      },
      update: {},
    })
    .catch((err) => {
      console.warn("[swarm-registry] nanopay persist failed:", err?.message ?? err)
    })
}

/**
 * Apply a partial status/settlement-tx update from the Gateway poller. Updates
 * the in-memory ring row (so next snapshot reflects new state), persists to DB,
 * and broadcasts a `nanopay-update` SSE event so clients can move rows from
 * pending → completed without a full refetch.
 */
export function updateNanopay(update: NanopayUpdate) {
  const idx = recentEvents.findIndex((e) => e.id === update.id)
  if (idx >= 0) {
    const prev = recentEvents[idx]
    recentEvents[idx] = {
      ...prev,
      status: update.status ?? prev.status,
      settlementTxHash: update.settlementTxHash ?? prev.settlementTxHash,
      transferId: update.transferId ?? prev.transferId,
    }
  }
  broadcast("nanopay-update", update)

  prisma.swarmNanopay
    .update({
      where: { id: update.id },
      data: {
        ...(update.status !== undefined && { status: update.status }),
        ...(update.settlementTxHash !== undefined && { settlementTxHash: update.settlementTxHash }),
        ...(update.transferId !== undefined && { transferId: update.transferId }),
      },
    })
    .catch((err) => {
      // Row may not exist yet if update races with record; swallow silently.
      if (err?.code !== "P2025") {
        console.warn("[swarm-registry] nanopay update failed:", err?.message ?? err)
      }
    })
}

export function recordConsensus(
  c: Omit<LatestConsensus, "ts" | "contractAddress"> & {
    ts?: number
    contractAddress?: string | null
  },
) {
  const contractAddress = c.contractAddress ? c.contractAddress.toLowerCase() : null
  latestConsensus = {
    ...c,
    ts: c.ts ?? Date.now(),
    contractAddress,
  }
  broadcast("consensus", latestConsensus)

  // Persist consensus row + per-evidence rows atomically: a partial write would
  // leave a consensus with no evidence (or vice versa) and confuse the reader.
  const consensusData = {
    ts: new Date(latestConsensus.ts),
    chainId: latestConsensus.chainId ?? null,
    betId: latestConsensus.betId ?? null,
    contractAddress,
    question: latestConsensus.question,
    topic: latestConsensus.topic,
    outcome: latestConsensus.outcome,
    spread: latestConsensus.spread,
    yesWeight: latestConsensus.yesWeight,
    noWeight: latestConsensus.noWeight,
    totalNanopayments: latestConsensus.totalNanopayments,
    totalSpentUsdc: new Prisma.Decimal(latestConsensus.totalSpentUsdc),
    resolutionTxHash: latestConsensus.resolutionTxHash,
    perOracle: latestConsensus.perOracle as unknown as Prisma.InputJsonValue,
  }

  prisma
    .$transaction(async (tx) => {
      const created = await tx.swarmConsensus.create({ data: consensusData })

      const evidenceRows: Prisma.SwarmEvidenceCreateManyInput[] = []
      for (const o of latestConsensus!.perOracle) {
        for (const e of o.evidence ?? []) {
          evidenceRows.push({
            consensusId: created.id,
            oracleId: o.oracleId,
            externalId: e.id,
            text: e.text,
            url: e.url,
            author: e.author ?? null,
            source: e.source,
            timestamp: e.timestamp,
            txHash: e.txHash ?? null,
          })
        }
      }
      if (evidenceRows.length > 0) {
        await tx.swarmEvidence.createMany({ data: evidenceRows })
      }
    })
    .catch((err) => {
      console.warn("[swarm-registry] consensus persist failed:", err?.message ?? err)
    })
}

/**
 * Hydrate in-memory state from DB on service boot so the swarm dashboard
 * doesn't show empty panels after a restart. Must be called before the SSE
 * stream accepts subscribers.
 */
export async function hydrateFromDb() {
  try {
    const [events, consensus, total] = await Promise.all([
      prisma.swarmNanopay.findMany({ orderBy: { ts: "desc" }, take: EVENTS_RING }),
      prisma.swarmConsensus.findFirst({
        orderBy: { ts: "desc" },
        include: { evidence: true },
      }),
      prisma.swarmNanopay.count(),
    ])

    recentEvents.splice(
      0,
      recentEvents.length,
      ...events.map(
        (e): NanopayEvent => ({
          id: e.id,
          ts: e.ts.getTime(),
          oracleId: e.oracleId,
          oracleEmoji: e.oracleEmoji,
          oracleName: e.oracleName,
          kind: e.kind as NanopayEvent["kind"],
          amountUsdc: Number(e.amountUsdc),
          txHash: e.txHash,
          verdict: (e.verdict ?? undefined) as NanopayEvent["verdict"],
          confidence: e.confidence ?? undefined,
          batchId: e.batchId,
          transferId: e.transferId,
          status: (e.status ?? null) as NanopayStatus | null,
          settlementTxHash: e.settlementTxHash,
          payer: e.payer,
        }),
      ),
    )
    totalNanoPayments = total

    if (consensus) {
      // Merge relational evidence rows back into the perOracle JSON so cached
      // readers see the same shape as a fresh recordConsensus payload.
      const evidenceByOracle = new Map<string, EvidenceItemPayload[]>()
      for (const e of consensus.evidence) {
        const list = evidenceByOracle.get(e.oracleId) ?? []
        list.push({
          id: e.externalId,
          text: e.text,
          url: e.url,
          author: e.author,
          source: e.source,
          timestamp: e.timestamp,
          txHash: e.txHash,
        })
        evidenceByOracle.set(e.oracleId, list)
      }

      const perOracleRaw = (consensus.perOracle as unknown as ConsensusOracleVote[]) ?? []
      const perOracle: ConsensusOracleVote[] = perOracleRaw.map((o) => {
        const fromDb = evidenceByOracle.get(o.oracleId) ?? []
        return {
          ...o,
          evidence: fromDb.length > 0 ? fromDb : (o.evidence ?? []),
        }
      })

      latestConsensus = {
        ts: consensus.ts.getTime(),
        chainId: consensus.chainId,
        betId: consensus.betId,
        contractAddress: consensus.contractAddress ?? null,
        question: consensus.question,
        topic: consensus.topic,
        outcome: consensus.outcome as LatestConsensus["outcome"],
        spread: consensus.spread,
        yesWeight: consensus.yesWeight,
        noWeight: consensus.noWeight,
        totalNanopayments: consensus.totalNanopayments,
        totalSpentUsdc: Number(consensus.totalSpentUsdc),
        resolutionTxHash: consensus.resolutionTxHash,
        perOracle,
      }
    }

    console.log(
      `[swarm-registry] hydrated: ${recentEvents.length} nanopays, ` +
        `${latestConsensus ? "1 consensus" : "0 consensus"} (total nanopays: ${totalNanoPayments})`,
    )
  } catch (err: any) {
    console.warn("[swarm-registry] hydrateFromDb failed:", err?.message ?? err)
  }
}

export function getLatestConsensus(): LatestConsensus | null {
  return latestConsensus
}

export function snapshot() {
  const now = Date.now()
  const nodes = Array.from(latest.values()).map((hb) => {
    const stale = now - hb.receivedAt > OFFLINE_AFTER_MS
    return {
      ...hb,
      status: stale ? ("offline" as const) : hb.status,
      latencyHistory: latencyHistory.get(hb.nodeId) ?? [],
    }
  })
  const onlineCount = nodes.filter((n) => n.status !== "offline").length
  const totalEarnings24hUsdc = nodes.reduce((a, n) => a + (n.earnings24h ?? 0), 0)
  const queries1h = nodes.reduce((a, n) => a + (n.queries1h ?? 0), 0)
  const evidenceServed24h = nodes.reduce((a, n) => a + (n.evidenceServed24h ?? 0), 0)
  return {
    nodes,
    events: recentEvents.slice(0, SNAPSHOT_EVENT_TAIL),
    aggregate: {
      onlineCount,
      totalCount: nodes.length,
      queries1h,
      evidenceServed24h,
      totalNanoPayments,
      totalEarnings24hUsdc,
      ts: now,
    },
    latestConsensus,
  }
}

export function subscribe(res: Response): () => void {
  subscribers.add(res)
  res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`)
  return () => subscribers.delete(res)
}

// Mark stale nodes offline periodically and notify subscribers
setInterval(() => {
  const now = Date.now()
  for (const hb of latest.values()) {
    if (now - hb.receivedAt > OFFLINE_AFTER_MS && hb.status !== "offline") {
      hb.status = "offline"
      broadcast("heartbeat", { node: hb, history: latencyHistory.get(hb.nodeId) ?? [] })
    }
  }
}, 5_000)
