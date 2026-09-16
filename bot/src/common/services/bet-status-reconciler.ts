import { formatUnits, getAddress, type PublicClient } from "viem"
import { prisma } from "../db"
import { getPublicClient, SUPPORTED_CHAINS } from "../chains"
import { BetAbi, EventBetAbi } from "./blockchain"
import { getFeedDecimals } from "./feed-decimals"

const RECONCILE_INTERVAL_MS =
  Number(process.env.BET_RECONCILE_INTERVAL_MS) > 0
    ? Number(process.env.BET_RECONCILE_INTERVAL_MS)
    : 60 * 60 * 1000

const PRICE_STATUS_MAP: Record<number, "OPEN" | "LOCKED" | "SETTLED" | "EXPIRED"> = {
  0: "OPEN",
  1: "LOCKED",
  2: "SETTLED",
  3: "EXPIRED",
}

const EVENT_STATUS_MAP: Record<number, "OPEN" | "LOCKED" | "SETTLED"> = {
  0: "OPEN",
  1: "LOCKED",
  2: "SETTLED",
}

const EVENT_OUTCOME_MAP: Record<number, string | null> = {
  0: null,
  1: "YES",
  2: "NO",
}

const EVENT_WINNING_SIDE_MAP: Record<number, string | null> = {
  0: "YES",
  1: "NO",
}

export async function startBetStatusReconciler() {
  const run = async () => {
    try {
      await reconcileAllChains()
    } catch (error) {
      console.error("[bet-reconciler] run error:", error)
    }
  }

  await run()
  setInterval(run, RECONCILE_INTERVAL_MS)
}

async function reconcileAllChains() {
  const activeChainIds = Object.values(SUPPORTED_CHAINS).map((c) => c.chainId)

  const proposals = await prisma.xProposal.findMany({
    where: {
      status: { in: ["OPEN", "LOCKED"] },
      contractAddress: { not: null },
      chainId: { in: activeChainIds },
    },
    select: {
      id: true,
      chainId: true,
      contractAddress: true,
      type: true,
      status: true,
    },
  })

  if (proposals.length === 0) {
    console.log(`[bet-reconciler] nothing to check`)
    return
  }

  console.log(`[bet-reconciler] checking ${proposals.length} active proposals across ${activeChainIds.length} chains`)

  const clientCache = new Map<number, PublicClient>()
  let fixed = 0

  for (const proposal of proposals) {
    const address = proposal.contractAddress
    if (!address) continue

    try {
      let client = clientCache.get(proposal.chainId)
      if (!client) {
        client = getPublicClient(proposal.chainId) as PublicClient
        clientCache.set(proposal.chainId, client)
      }

      const changed =
        proposal.type === "EVENT_BET"
          ? await reconcileEventBet(client, proposal.id, getAddress(address), proposal.status)
          : await reconcilePriceBet(client, proposal.id, getAddress(address), proposal.status)

      if (changed) fixed += 1
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || String(err)
      console.error(`[bet-reconciler] proposal #${proposal.id} (${address}) failed: ${msg}`)
    }
  }

  if (fixed > 0) {
    console.log(`[bet-reconciler] updated ${fixed}/${proposals.length} proposals`)
  }
}

async function reconcilePriceBet(
  client: PublicClient,
  proposalId: number,
  contractAddress: `0x${string}`,
  dbStatus: string,
): Promise<boolean> {
  const info: any = await client.readContract({
    address: contractAddress,
    abi: BetAbi,
    functionName: "getBetInfo",
  })

  const nextStatus = PRICE_STATUS_MAP[Number(info.status)]
  if (!nextStatus) return false

  const data: Record<string, unknown> = {
    status: nextStatus,
    totalUp: formatUnits(info.totalUp ?? 0n, 6),
    totalDown: formatUnits(info.totalDown ?? 0n, 6),
  }

  const feedDecimals = info.priceFeed
    ? await getFeedDecimals(client, getAddress(info.priceFeed as `0x${string}`))
    : 8

  if (Number(info.startTime) > 0) {
    data.startTime = new Date(Number(info.startTime) * 1000)
    data.startPrice = formatUnits(info.startPrice < 0n ? -info.startPrice : info.startPrice, feedDecimals)
  }
  if (Number(info.endTime) > 0) {
    data.endTime = new Date(Number(info.endTime) * 1000)
  }
  if (nextStatus === "SETTLED") {
    data.endPrice = formatUnits(info.endPrice < 0n ? -info.endPrice : info.endPrice, feedDecimals)
    data.isDraw = Boolean(info.isDraw)
    data.winningSide = info.isDraw ? null : Number(info.winningSide) === 0 ? "UP" : "DOWN"
  }

  await prisma.xProposal.update({ where: { id: proposalId }, data })
  if (nextStatus !== dbStatus) {
    console.log(`[bet-reconciler] price proposal #${proposalId}: ${dbStatus} -> ${nextStatus}`)
  }
  return nextStatus !== dbStatus
}

async function reconcileEventBet(
  client: PublicClient,
  proposalId: number,
  contractAddress: `0x${string}`,
  dbStatus: string,
): Promise<boolean> {
  const info: any = await client.readContract({
    address: contractAddress,
    abi: EventBetAbi,
    functionName: "getEventBetInfo",
  })

  const nextStatus = EVENT_STATUS_MAP[Number(info.status)]
  if (!nextStatus) return false

  const data: Record<string, unknown> = {
    status: nextStatus,
    totalYes: formatUnits(info.totalYes ?? 0n, 6),
    totalNo: formatUnits(info.totalNo ?? 0n, 6),
    isDraw: Boolean(info.isDraw),
  }

  if (nextStatus === "SETTLED") {
    data.outcome = EVENT_OUTCOME_MAP[Number(info.outcome)] ?? null
    data.winningSide = info.isDraw ? null : EVENT_WINNING_SIDE_MAP[Number(info.winningSide)] ?? null
  }

  await prisma.xProposal.update({ where: { id: proposalId }, data })
  if (nextStatus !== dbStatus) {
    console.log(`[bet-reconciler] event proposal #${proposalId}: ${dbStatus} -> ${nextStatus}`)
  }
  return nextStatus !== dbStatus
}
