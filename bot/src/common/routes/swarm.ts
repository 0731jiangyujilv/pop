import { Router } from "express"
import { z } from "zod"
import { prisma } from "../db"
import {
  getLatestConsensus,
  recordConsensus,
  recordHeartbeat,
  recordNanopay,
  snapshot,
  subscribe,
  updateNanopay,
} from "../services/swarm-registry"

export const swarmRouter = Router()

const heartbeatSchema = z.object({
  nodeId: z.string().min(1).max(120),
  displayName: z.string().min(1).max(120),
  emoji: z.string().min(1).max(8),
  dataSource: z.string().min(1).max(40),
  status: z.enum(["healthy", "degraded", "offline"]),
  selfLatencyMs: z.number().nonnegative(),
  upstreamLatencyMs: z.number().nonnegative(),
  geminiLatencyMs: z.number().nonnegative(),
  walletAddress: z.string().min(1).max(64),
  walletBalanceUsdc: z.number().nonnegative(),
  earnings1h: z.number().nonnegative(),
  earnings24h: z.number().nonnegative(),
  queries1h: z.number().nonnegative(),
  queries24h: z.number().nonnegative(),
  evidenceServed24h: z.number().nonnegative(),
  accuracyVsMajority: z.number().min(0).max(1),
  uptimeSec: z.number().nonnegative(),
  version: z.string().min(1).max(40),
  timestamp: z.string().min(1).max(40),
  agentTokenId: z.number().int().nonnegative().optional(),
  reputation: z.number().optional(),
  registryAddress: z.string().max(64).optional(),
})

swarmRouter.post("/heartbeat", (req, res) => {
  const parsed = heartbeatSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "invalid heartbeat", issues: parsed.error.issues })
    return
  }
  recordHeartbeat(parsed.data)
  res.json({ ok: true })
})

const nanopayStatusSchema = z.enum(["received", "batched", "confirmed", "completed", "failed"])

const nanopaySchema = z.object({
  id: z.string().min(1).max(80),
  oracleId: z.string().min(1).max(80),
  oracleEmoji: z.string().min(1).max(8),
  oracleName: z.string().min(1).max(80),
  kind: z.enum(["evidence", "summarize", "verdict"]),
  amountUsdc: z.number().nonnegative(),
  txHash: z.string().min(4).max(80),
  verdict: z.enum(["YES", "NO"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  batchId: z.string().max(64).nullable().optional(),
  transferId: z.string().max(80).nullable().optional(),
  status: nanopayStatusSchema.nullable().optional(),
  payer: z.string().max(64).nullable().optional(),
})

swarmRouter.post("/nanopay", (req, res) => {
  const parsed = nanopaySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "invalid nanopay", issues: parsed.error.issues })
    return
  }
  recordNanopay(parsed.data)
  res.json({ ok: true })
})

const nanopayUpdateSchema = z.object({
  id: z.string().min(1).max(80),
  status: nanopayStatusSchema.optional(),
  settlementTxHash: z.string().max(80).nullable().optional(),
  transferId: z.string().max(80).nullable().optional(),
})

swarmRouter.post("/nanopay/update", (req, res) => {
  const parsed = nanopayUpdateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "invalid update", issues: parsed.error.issues })
    return
  }
  updateNanopay(parsed.data)
  res.json({ ok: true })
})

const evidenceItemSchema = z.object({
  id: z.string().max(120),
  text: z.string(),
  url: z.string(),
  author: z.string().nullable().optional(),
  source: z.string().max(40),
  timestamp: z.string().max(40),
  txHash: z.string().max(80).nullable().optional(),
})

const consensusOracleSchema = z.object({
  oracleId: z.string().min(1).max(80),
  dataSource: z.string().min(1).max(40),
  emoji: z.string().min(1).max(8),
  name: z.string().min(1).max(80),
  verdict: z.enum(["YES", "NO"]),
  confidence: z.number().min(0).max(1),
  verdictTxHash: z.string().nullable(),
  summaryTxHash: z.string().nullable(),
  evidenceTxHashes: z.array(z.string()),
  reasoning: z.string(),
  error: z.string().optional(),
  summary: z.string().nullable().optional(),
  reputationDelta: z.number().int().optional(),
  evidence: z.array(evidenceItemSchema).default([]),
})

const consensusSchema = z.object({
  question: z.string().min(1),
  topic: z.string().min(1),
  outcome: z.enum(["YES", "NO"]),
  spread: z.number(),
  yesWeight: z.number(),
  noWeight: z.number(),
  totalNanopayments: z.number().int().nonnegative(),
  totalSpentUsdc: z.number().nonnegative(),
  resolutionTxHash: z.string().nullable(),
  chainId: z.number().int().nullable(),
  betId: z.number().int().nullable(),
  contractAddress: z.string().max(64).nullable().optional(),
  perOracle: z.array(consensusOracleSchema),
})

swarmRouter.post("/consensus", (req, res) => {
  const parsed = consensusSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "invalid consensus", issues: parsed.error.issues })
    return
  }
  recordConsensus(parsed.data)
  res.json({ ok: true })
})

swarmRouter.get("/snapshot", (_req, res) => {
  res.json(snapshot())
})

swarmRouter.get("/latest-consensus", (_req, res) => {
  res.json(getLatestConsensus())
})

/**
 * Look up the latest swarm consensus that resolved a given EventBet contract.
 * Returns the SwarmConsensus row + its joined SwarmEvidence rows merged into
 * `perOracle[i].evidence` so the webapp can render everything from one fetch.
 *
 * Query: GET /api/swarm/consensus/by-contract/:address?chainId=NNN
 *   • address  — case-insensitive 0x-prefixed hex; we lower-case before lookup.
 *   • chainId  — optional; narrows when the same address might exist on multi
 *                chains (rare but defensive).
 */
swarmRouter.get("/consensus/by-contract/:address", async (req, res) => {
  const raw = String(req.params.address ?? "").toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(raw)) {
    res.status(400).json({ error: "invalid contract address" })
    return
  }
  const chainIdParam = req.query.chainId
  const chainId = typeof chainIdParam === "string" && chainIdParam.length > 0 ? Number(chainIdParam) : null
  if (chainId !== null && !Number.isFinite(chainId)) {
    res.status(400).json({ error: "invalid chainId" })
    return
  }

  try {
    const consensus = await prisma.swarmConsensus.findFirst({
      where: {
        contractAddress: raw,
        ...(chainId !== null ? { chainId } : {}),
      },
      orderBy: { ts: "desc" },
      include: { evidence: true },
    })
    if (!consensus) {
      res.status(404).json({ error: "no consensus found for this contract" })
      return
    }

    // perOracle is already JSON; we just merge the relational evidence rows in
    // by oracleId so each oracle entry carries its own list.
    const evidenceByOracle = new Map<string, typeof consensus.evidence>()
    for (const e of consensus.evidence) {
      const list = evidenceByOracle.get(e.oracleId) ?? []
      list.push(e)
      evidenceByOracle.set(e.oracleId, list)
    }

    const perOracleRaw = (consensus.perOracle as unknown as Array<Record<string, unknown>>) ?? []
    const perOracle = perOracleRaw.map((o) => {
      const oracleId = String(o.oracleId ?? "")
      const rows = evidenceByOracle.get(oracleId) ?? []
      const dbEvidence = rows.map((e) => ({
        id: e.externalId,
        text: e.text,
        url: e.url,
        author: e.author,
        source: e.source,
        timestamp: e.timestamp,
        txHash: e.txHash,
      }))
      // If recordConsensus already inlined evidence into the JSON (newer rows),
      // prefer the relational rows when present (authoritative), else fall back.
      return {
        ...o,
        evidence: dbEvidence.length > 0 ? dbEvidence : (o.evidence ?? []),
      }
    })

    res.json({
      ts: consensus.ts.getTime(),
      chainId: consensus.chainId,
      betId: consensus.betId,
      contractAddress: consensus.contractAddress,
      question: consensus.question,
      topic: consensus.topic,
      outcome: consensus.outcome,
      spread: consensus.spread,
      yesWeight: consensus.yesWeight,
      noWeight: consensus.noWeight,
      totalNanopayments: consensus.totalNanopayments,
      totalSpentUsdc: Number(consensus.totalSpentUsdc),
      resolutionTxHash: consensus.resolutionTxHash,
      perOracle,
    })
  } catch (err: any) {
    console.error("[swarm] consensus by-contract lookup failed:", err?.message ?? err)
    res.status(500).json({ error: "lookup failed" })
  }
})

swarmRouter.get("/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })
  res.flushHeaders?.()

  const unsubscribe = subscribe(res)
  const keepalive = setInterval(() => res.write(`: ping\n\n`), 15_000)

  req.on("close", () => {
    clearInterval(keepalive)
    unsubscribe()
    res.end()
  })
})
