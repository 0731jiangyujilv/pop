import { formatUnits, getAddress } from "viem"
import { config, publicWebappUrl } from "../common/config"
import { prisma } from "../common/db"
import { publicClient } from "../common/services/blockchain"
import { createTweet, tweetUrl } from "./x-api"

const BET_CREATED_EVENT = {
  type: "event",
  name: "BetCreated",
  inputs: [
    { name: "betId", type: "uint256", indexed: true },
    { name: "betContract", type: "address", indexed: false },
    { name: "creator", type: "address", indexed: true },
    { name: "token", type: "address", indexed: false },
    { name: "asset", type: "string", indexed: false },
  ],
} as const

const BET_EVENTS = [
  {
    type: "event",
    name: "BetPlaced",
    inputs: [
      { name: "player", type: "address", indexed: true },
      { name: "side", type: "uint8", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BetLocked",
    inputs: [
      { name: "startPrice", type: "int256", indexed: false },
      { name: "startTime", type: "uint256", indexed: false },
      { name: "endTime", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BetSettled",
    inputs: [
      { name: "winningSide", type: "uint8", indexed: false },
      { name: "isDraw", type: "bool", indexed: false },
      { name: "endPrice", type: "int256", indexed: false },
    ],
  },
] as const

let lastProcessedBlock: bigint | null = null

function sideLabel(side: string | null, isDraw: boolean) {
  if (isDraw) return "DRAW"
  return side === "UP" ? "UP" : "DOWN"
}

function openAnnouncementText(proposal: {
  creatorUsername: string | null
  asset: string
  duration: number
  contractAddress: string
  tweetId: string
  chainId?: number
}) {
  const creator = proposal.creatorUsername ? `@${proposal.creatorUsername}` : "the creator"
  const joinUrl = `${publicWebappUrl}/bet/${proposal.contractAddress}?chainId=${proposal.chainId || 84532}`
  const originalUrl = proposal.creatorUsername
    ? tweetUrl(proposal.creatorUsername, proposal.tweetId)
    : `https://x.com/i/web/status/${proposal.tweetId}`

  return [
    `${creator}'s ${proposal.asset} ${Math.round(proposal.duration / 60)}m prediction market is now live on-chain.`,
    `Join here: ${joinUrl}`,
    `Original post: ${originalUrl}`,
    `Settlement uses the project oracle with admin-triggered lock and settle.`,
  ].join("\n")
}

function settledText(proposal: {
  asset: string
  startPrice: string | null
  endPrice: string | null
  winningSide: string | null
  isDraw: boolean
  contractAddress: string
  chainId?: number
}) {
  const creatorFeePct = (config.TOTAL_FEE_BPS * config.CREATOR_FEE_BPS) / 100
  const claimUrl = `${publicWebappUrl}/bet/${proposal.contractAddress}?chainId=${proposal.chainId || 84532}&action=claim`

  return [
    `${proposal.asset} prediction has settled: ${sideLabel(proposal.winningSide, proposal.isDraw)}.`,
    `Start price ${proposal.startPrice || "?"}, end price ${proposal.endPrice || "?"}.`,
    `Claim: ${claimUrl}`,
    `Fee: ${config.TOTAL_FEE_BPS / 100}%. The market creator receives ${config.CREATOR_FEE_BPS}% of that fee (${creatorFeePct / 100}%).`,
  ].join("\n")
}

export async function startXEventListener() {
  lastProcessedBlock = await publicClient.getBlockNumber()
  setInterval(() => {
    pollEvents().catch((error) => {
      console.error("[xbot] event poll failed:", error)
    })
  }, config.POLL_INTERVAL_MS)
}

async function pollEvents() {
  const currentBlock = await publicClient.getBlockNumber()
  if (lastProcessedBlock === null || currentBlock <= lastProcessedBlock) return

  const fromBlock = lastProcessedBlock + 1n
  const toBlock = currentBlock
  lastProcessedBlock = toBlock

  await pollBetCreatedFallback(fromBlock, toBlock)
  await pollTrackedContracts(fromBlock, toBlock)
}

async function pollBetCreatedFallback(fromBlock: bigint, toBlock: bigint) {
  const logs = await publicClient.getLogs({
    address: getAddress(config.BET_FACTORY_ADDRESS),
    event: BET_CREATED_EVENT,
    fromBlock,
    toBlock,
  })

  for (const log of logs) {
    const betId = Number((log as any).args.betId)
    const contractAddress = String((log as any).args.betContract)
    const creator = String((log as any).args.creator).toLowerCase()

    const proposal = await prisma.xProposal.findFirst({
      where: {
        contractAddress: null,
        creatorWallet: creator,
        status: "PROPOSED",
      },
      orderBy: { createdAt: "desc" },
    })

    if (!proposal) continue

    const deadline = await publicClient.readContract({
      address: getAddress(contractAddress),
      abi: [{ type: "function", name: "bettingDeadline", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" }],
      functionName: "bettingDeadline",
    })

    await prisma.xProposal.update({
      where: { id: proposal.id },
      data: {
        contractAddress,
        onChainBetId: betId,
        status: "OPEN",
        bettingDeadline: new Date(Number(deadline) * 1000),
      },
    })

    await announceXOpen(proposal.id)
  }
}

async function pollTrackedContracts(fromBlock: bigint, toBlock: bigint) {
  const proposals = await prisma.xProposal.findMany({
    where: {
      contractAddress: { not: null },
      status: { in: ["OPEN", "LOCKED"] },
    },
    select: { id: true, contractAddress: true },
  })

  for (const proposal of proposals) {
    const logs = await publicClient.getLogs({
      address: getAddress(proposal.contractAddress!),
      events: BET_EVENTS,
      fromBlock,
      toBlock,
    })

    for (const log of logs as any[]) {
      if (log.eventName === "BetPlaced") {
        await handleBetPlaced(proposal.id, log)
      } else if (log.eventName === "BetLocked") {
        await handleBetLocked(proposal.id, log)
      } else if (log.eventName === "BetSettled") {
        await handleBetSettled(proposal.id, log)
      }
    }
  }
}

async function handleBetPlaced(proposalId: number, log: any) {
  const proposal = await prisma.xProposal.findUnique({ where: { id: proposalId } })
  if (!proposal) return

  const side = Number(log.args.side) === 0 ? "UP" : "DOWN"
  const amount = parseFloat(formatUnits(log.args.amount, 6))
  const data = side === "UP"
    ? { totalUp: Number(proposal.totalUp) + amount }
    : { totalDown: Number(proposal.totalDown) + amount }

  await prisma.xProposal.update({ where: { id: proposalId }, data })
}

async function handleBetLocked(proposalId: number, log: any) {
  await prisma.xProposal.update({
    where: { id: proposalId },
    data: {
      status: "LOCKED",
      startPrice: formatUnits(log.args.startPrice < 0n ? -log.args.startPrice : log.args.startPrice, 8),
      startTime: new Date(Number(log.args.startTime) * 1000),
      endTime: new Date(Number(log.args.endTime) * 1000),
    },
  })
}

async function handleBetSettled(proposalId: number, log: any) {
  const side = (log.args.isDraw as boolean) ? null : (Number(log.args.winningSide) === 0 ? "UP" : "DOWN")
  const proposal = await prisma.xProposal.update({
    where: { id: proposalId },
    data: {
      status: "SETTLED",
      winningSide: side,
      isDraw: log.args.isDraw as boolean,
      endPrice: formatUnits(log.args.endPrice < 0n ? -log.args.endPrice : log.args.endPrice, 8),
    },
  })

  if (proposal.settlementTweetId || !proposal.announcementTweetId || !proposal.contractAddress) return

  const tweet = await createTweet({
    text: settledText({
      asset: proposal.asset,
      startPrice: proposal.startPrice,
      endPrice: proposal.endPrice,
      winningSide: proposal.winningSide,
      isDraw: proposal.isDraw,
      contractAddress: proposal.contractAddress,
    }),
    replyToTweetId: proposal.announcementTweetId,
  })

  await prisma.xProposal.update({
    where: { id: proposalId },
    data: { settlementTweetId: tweet.id },
  })
}

export async function announceXOpen(proposalId: number) {
  const proposal = await prisma.xProposal.findUnique({ where: { id: proposalId } })
  if (!proposal || !proposal.contractAddress || proposal.announcementTweetId) return

  const tweet = await createTweet({
    text: openAnnouncementText({
      creatorUsername: proposal.creatorUsername,
      asset: proposal.asset,
      duration: proposal.duration,
      contractAddress: proposal.contractAddress,
      tweetId: proposal.tweetId,
    }),
    replyToTweetId: proposal.proposalReplyTweetId || proposal.tweetId,
  })

  await prisma.xProposal.update({
    where: { id: proposalId },
    data: { announcementTweetId: tweet.id },
  })
}
