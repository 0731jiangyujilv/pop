import { getAddress, type PublicClient, type WalletClient } from "viem"
import { prisma } from "../db"
import {
  EventBetAbi,
  getEventBetCount,
  getEventBetAddress,
  getPublicClient,
  getWalletClient,
  SUPPORTED_CHAINS,
} from "./blockchain"
import { config } from "../config"
import { getCapability } from "../capabilities/registry"
import { resolveEvent } from "./event-resolver"
import { resolveWithSwarm } from "./oracle-aggregator"
import { applySwarmReputation, deriveEventKey } from "./oracle-reputation"
// Consensus is posted over HTTP to the betsys-service process (different PM2 proc);
// importing recordConsensus directly would write into THIS worker's in-memory state
// and never reach the SSE subscribers on the service process.
const SWARM_CONSENSUS_URL =
  process.env.BOT_INTERNAL_URL?.replace(/\/$/, "") ??
  `http://127.0.0.1:${config.PORT}`
import { simulateBeforeWrite } from "./simulate"
import { tryAcquireLease } from "./worker-lease"
import { enqueueVerification } from "./verification-queue"
import { writeContractWithAttribution } from "./writeWithAttribution"

const USE_SWARM = (process.env.USE_ORACLE_SWARM ?? "true").toLowerCase() !== "false"

const POLL_INTERVAL_MS = config.SETTLEMENT_CRON_INTERVAL_MS
const inFlight = new Set<string>()
const LEASE_TTL_MS = POLL_INTERVAL_MS * 2

let txMutex: Promise<unknown> = Promise.resolve()
let runCounter = 0

function withTxMutex<T>(fn: () => Promise<T>): Promise<T> {
  const next = txMutex.then(fn, fn)
  txMutex = next.catch(() => {})
  return next
}

export function startEventSettlementCron() {
  const firstChainId = Object.keys(SUPPORTED_CHAINS).map(Number)[0] ?? 84532
  const firstWallet = getWalletClient(firstChainId)
  if (!firstWallet) {
    console.warn("🔮 Event settlement executor disabled: BOT_PRIVATE_KEY is not configured")
    return
  }

  console.log(
    `🔮 Event settlement executor started (every ${POLL_INTERVAL_MS}ms) with admin ${firstWallet.account!.address}`
  )

  const run = async () => {
    const runId = ++runCounter
    const startedAt = Date.now()
    try {
      console.log(`🔮 Run #${runId}: tick started at ${new Date(startedAt).toISOString()}`)

      for (const chainCfg of Object.values(SUPPORTED_CHAINS)) {
        if (!chainCfg.eventBetFactoryAddress || /^0x0{40}$/i.test(chainCfg.eventBetFactoryAddress)) {
          continue
        }

        const leaseKey = `event_settlement_worker_${chainCfg.chainId}`
        const acquired = await tryAcquireLease(leaseKey, LEASE_TTL_MS)
        if (!acquired) continue

        try {
          await processEventBets(runId, chainCfg.chainId)
        } catch (err) {
          console.error(`🔮 Run #${runId}: chain ${chainCfg.chainId} error:`, err)
        }
      }

      console.log(`🔮 Run #${runId}: completed in ${Date.now() - startedAt}ms`)
    } catch (err) {
      console.error(`🔮 Run #${runId}: executor error:`, err)
    }
  }

  run()
  setInterval(run, POLL_INTERVAL_MS)
}

async function processEventBets(runId: number, chainId: number) {
  const client = getPublicClient(chainId) as PublicClient
  const wallet = getWalletClient(chainId) as WalletClient
  if (!wallet) return

  let betCount: number
  try {
    betCount = Number(await getEventBetCount(chainId))
  } catch {
    return // No EventBetFactory on this chain
  }

  const now = Math.floor(Date.now() / 1000)

  console.log(`🔮 Run #${runId}: scanning ${betCount} event bets on chain ${chainId}`)

  for (let betId = 0; betId < betCount; betId++) {
    const rawAddr = await getEventBetAddress(betId, chainId)
    if (!rawAddr || /^0x0{40}$/i.test(rawAddr)) continue

    const contractAddress = getAddress(rawAddr)

    let info: any
    try {
      info = await client.readContract({
        address: contractAddress,
        abi: EventBetAbi,
        functionName: "getEventBetInfo",
      })
    } catch (err: any) {
      console.error(`🔮 EventBet #${betId}: failed to read info: ${err?.shortMessage || err?.message}`)
      continue
    }

    const onChainStatus = Number(info.status)
    const bettingDeadline = Number(info.bettingDeadline)
    const closingTime = Number(info.closingTime)

    // Sync DB state
    await syncEventBetDbState({ onChainBetId: betId, contractAddress, chainId }, info)

    // Enqueue for contract verification (idempotent upsert)
    await enqueueVerification({ contractAddress, kind: "EVENT_BET" }).catch(() => {})

    // Open → Closed: past bettingDeadline
    if (onChainStatus === 0 && now >= bettingDeadline) {
      await executeClose({ runId, betId, contractAddress, client, wallet })
    }
    // Closed → Settled: past closingTime
    else if (onChainStatus === 1 && now >= closingTime) {
      await executeResolve({ runId, betId, contractAddress, chainId, client, wallet })
    }
  }
}

async function executeClose(params: {
  runId: number
  betId: number
  contractAddress: `0x${string}`
  client: PublicClient
  wallet: WalletClient
}) {
  const key = `${params.contractAddress}:close`
  if (inFlight.has(key)) return
  inFlight.add(key)

  try {
    await withTxMutex(async () => {
      console.log(`🔮 EventBet #${params.betId}: closing`)

      await simulateBeforeWrite(params.client, params.wallet, {
        address: params.contractAddress,
        abi: EventBetAbi,
        functionName: "close",
      })

      const tx = await writeContractWithAttribution(params.wallet, params.client, {
        address: params.contractAddress,
        abi: EventBetAbi,
        functionName: "close",
      })
      console.log(`🔮 EventBet #${params.betId}: close tx=${tx}`)
    })
  } catch (err: any) {
    console.error(`🔮 EventBet #${params.betId}: close failed:`, err?.shortMessage || err?.message)
  } finally {
    inFlight.delete(key)
  }
}

async function executeResolve(params: {
  runId: number
  betId: number
  contractAddress: `0x${string}`
  chainId: number
  client: PublicClient
  wallet: WalletClient
}) {
  const key = `${params.contractAddress}:resolve`
  if (inFlight.has(key)) return
  inFlight.add(key)

  try {
    await withTxMutex(async () => {
      // Find the proposal in DB to get data source config
      const proposal = await prisma.xProposal.findFirst({
        where: {
          contractAddress: params.contractAddress.toLowerCase().replace("0x", "").padStart(42, "0"),
          type: "EVENT_BET",
        },
      })

      // Also try exact match
      const proposal2 = proposal || await prisma.xProposal.findFirst({
        where: {
          chainId: params.chainId,
          onChainBetId: params.betId,
          type: "EVENT_BET",
        },
      })

      const p = proposal || proposal2
      if (!p?.question) {
        console.error(`🔮 EventBet #${params.betId}: no proposal found in DB, cannot resolve`)
        return
      }

      // dataSourceConfig is optional — null means "resolve via 5-oracle swarm"
      const dataSourceType = p.dataSourceType || (p.dataSourceConfig ? "X_POST" : "SWARM")
      const dataSourceConfig = p.dataSourceConfig ? JSON.parse(p.dataSourceConfig) : null
      const forceSwarm = dataSourceType === "SWARM" || !dataSourceConfig

      // Read question from contract as source of truth
      const contractQuestion = await params.client.readContract({
        address: params.contractAddress,
        abi: EventBetAbi,
        functionName: "question",
      }) as string

      // Pick resolution path:
      //   • SWARM forced by dataSourceType=="SWARM" (no explicit capability), OR
      //   • USE_ORACLE_SWARM env toggle (default on) overrides any capability.
      // Legacy single-LLM path runs only when neither condition holds AND a
      // capability+config is present.
      let outcome: "YES" | "NO"
      let reasoning: string
      let swarmResult: Awaited<ReturnType<typeof resolveWithSwarm>> | null = null
      let swarmTopic: string | null = null

      let reputationDeltas: Record<string, number> = {}
      if (forceSwarm || USE_SWARM) {
        const topic = (dataSourceConfig?.topic as string | undefined) ?? contractQuestion
        console.log(`🧠 EventBet #${params.betId}: resolving via 5-oracle swarm — topic="${topic.slice(0, 60)}"`)
        const swarm = await resolveWithSwarm(contractQuestion, topic)
        swarmResult = swarm
        swarmTopic = topic
        outcome = swarm.outcome
        reasoning = swarm.reasoning
        console.log(
          `🧠 EventBet #${params.betId}: swarm ${outcome} (spread ${swarm.spread.toFixed(2)}) ` +
            `via ${swarm.totalNanopayments} nanopays ($${swarm.totalSpentUsdc.toFixed(4)})`,
        )

        // ERC-8004 reputation update (no-op if registry env not configured).
        // Awaited so we can capture per-oracle deltas for the consensus payload —
        // even when on-chain write is skipped, the rule-derived deltas come back.
        const eventKey = deriveEventKey(params.contractAddress, params.betId)
        const repResult = await applySwarmReputation({
          eventKey,
          finalOutcome: outcome,
          perOracle: swarm.perOracle,
        })
        reputationDeltas = repResult.deltas
      } else {
        const capability = getCapability(dataSourceType)
        if (!capability) {
          console.error(`🔮 EventBet #${params.betId}: unknown capability "${dataSourceType}", cannot resolve`)
          return
        }
        console.log(`🔮 EventBet #${params.betId}: resolving "${contractQuestion}" via capability "${dataSourceType}"`)
        const fetchedData = await capability.fetchData(dataSourceConfig, p.createdAt, new Date())
        console.log(`🔮 EventBet #${params.betId}: fetched ${fetchedData.items.length} items from ${fetchedData.source}`)
        const resolution = await resolveEvent(contractQuestion, fetchedData.items, fetchedData.source)
        outcome = resolution.outcome
        reasoning = resolution.reasoning
        console.log(`🔮 EventBet #${params.betId}: single-LLM ${outcome} (conf ${resolution.confidence})`)
      }

      // Map outcome to uint8: YES=1, NO=2
      const outcomeUint8 = outcome === "YES" ? 1 : 2

      // EventBet.resolve truncates long reasoning on-chain — keep it bounded
      const reasoningForChain = reasoning.length > 1800 ? reasoning.slice(0, 1800) + "…" : reasoning

      await simulateBeforeWrite(params.client, params.wallet, {
        address: params.contractAddress,
        abi: EventBetAbi,
        functionName: "resolve",
        args: [outcomeUint8, reasoningForChain],
      })

      const tx = await writeContractWithAttribution(params.wallet, params.client, {
        address: params.contractAddress,
        abi: EventBetAbi,
        functionName: "resolve",
        args: [outcomeUint8, reasoningForChain],
      })

      console.log(`🔮 EventBet #${params.betId}: resolve tx=${tx} outcome=${outcome}`)

      // Publish consensus snapshot to the service process (different PM2 proc)
      // so it can persist + broadcast over SSE to the ops dashboard.
      if (swarmResult && swarmTopic !== null) {
        const yesWeight = swarmResult.perOracle
          .filter((r) => r.verdict === "YES")
          .reduce((a, r) => a + r.confidence, 0)
        const noWeight = swarmResult.perOracle
          .filter((r) => r.verdict === "NO")
          .reduce((a, r) => a + r.confidence, 0)
        const payload = {
          question: contractQuestion,
          topic: swarmTopic,
          outcome,
          spread: swarmResult.spread,
          yesWeight,
          noWeight,
          totalNanopayments: swarmResult.totalNanopayments,
          totalSpentUsdc: swarmResult.totalSpentUsdc,
          resolutionTxHash: tx,
          chainId: params.chainId,
          betId: params.betId,
          contractAddress: params.contractAddress.toLowerCase(),
          perOracle: swarmResult.perOracle.map((r) => ({
            oracleId: r.oracle.id,
            dataSource: r.oracle.dataSource,
            emoji: r.oracle.emoji,
            name: r.oracle.name,
            verdict: r.verdict,
            confidence: r.confidence,
            verdictTxHash: r.verdictTxHash,
            summaryTxHash: r.summaryTxHash,
            evidenceTxHashes: r.evidenceTxHashes,
            reasoning: r.reasoning,
            error: r.error,
            summary: r.summary,
            reputationDelta: reputationDeltas[r.oracle.id] ?? 0,
            evidence: r.evidence.map((e, idx) => ({
              id: e.id,
              text: e.text,
              url: e.url,
              author: e.author,
              source: e.source,
              timestamp: e.timestamp,
              txHash: r.evidenceTxHashes[idx] ?? null,
            })),
          })),
        }
        try {
          const resp = await fetch(`${SWARM_CONSENSUS_URL}/api/swarm/consensus`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
          if (!resp.ok) {
            console.warn(
              `[event-settlement] consensus POST failed: ${resp.status} ${await resp.text().catch(() => "")}`,
            )
          }
        } catch (err: any) {
          console.warn(`[event-settlement] consensus POST error: ${err?.message ?? err}`)
        }
      }

      // Update DB
      await prisma.xProposal.updateMany({
        where: { chainId: params.chainId, onChainBetId: params.betId, type: "EVENT_BET" },
        data: {
          outcome,
          winningSide: outcome,
          status: "SETTLED",
        },
      })
    })
  } catch (err: any) {
    console.error(`🔮 EventBet #${params.betId}: resolve failed:`, err?.shortMessage || err?.message)
  } finally {
    inFlight.delete(key)
  }
}

async function syncEventBetDbState(
  id: { onChainBetId: number; contractAddress: string; chainId: number },
  info: any,
) {
  const statusMap: Record<number, "OPEN" | "LOCKED" | "SETTLED"> = {
    0: "OPEN",
    1: "LOCKED", // "Closed" on chain maps to "LOCKED" in DB
    2: "SETTLED",
  }

  const dbStatus = statusMap[Number(info.status)]
  if (!dbStatus) return

  const outcomeMap: Record<number, string | null> = {
    0: null,
    1: "YES",
    2: "NO",
  }

  const winningSideMap: Record<number, string | null> = {
    0: "YES",
    1: "NO",
  }

  try {
    await prisma.xProposal.updateMany({
      where: {
        chainId: id.chainId,
        onChainBetId: id.onChainBetId,
        type: "EVENT_BET",
      },
      data: {
        status: dbStatus,
        totalYes: info.totalYes?.toString() ?? "0",
        totalNo: info.totalNo?.toString() ?? "0",
        isDraw: info.isDraw ?? false,
        ...(dbStatus === "SETTLED" ? {
          outcome: outcomeMap[Number(info.outcome)] ?? null,
          winningSide: info.isDraw ? null : (winningSideMap[Number(info.winningSide)] ?? null),
        } : {}),
      },
    })
  } catch {
    // Proposal may not exist yet, ignore
  }
}
