import { Markup } from "telegraf"
import { formatUnits, getAddress, type PublicClient } from "viem"
import { prisma } from "../db"
import { config, publicWebappUrl } from "../config"
import { BetAbi, BetFactoryAbi } from "./blockchain"
import { getPublicClient, SUPPORTED_CHAINS } from "../chains"
import { enqueueVerification } from "./verification-queue"
import { getFeedDecimalsForBet } from "./feed-decimals"
import { bot } from "../../tg/bot"
import { betLockedMessage, betOpenMessage, betSettledMessage } from "../../tg/messages"
import { createTweet, tweetUrl } from "../../x/x-api"

const POLL_INTERVAL_MS = config.POLL_INTERVAL_MS
// Many public RPCs cap eth_getLogs at 500 blocks (Base Sepolia public, etc.). Keep below the lowest we rely on.
const MAX_BLOCK_RANGE = BigInt(
  Number(process.env.BET_LISTENER_BLOCK_RANGE) > 0 ? Number(process.env.BET_LISTENER_BLOCK_RANGE) : 400,
)

export async function startBetListener() {
  const run = async () => {
    for (const chainCfg of Object.values(SUPPORTED_CHAINS)) {
      try {
        await pollBetEventsForChain(chainCfg.chainId)
      } catch (error) {
        console.error(`[bet-listener] chain ${chainCfg.chainId} error:`, error)
      }
    }
  }

  await run()
  setInterval(run, POLL_INTERVAL_MS)
}

async function pollBetEventsForChain(chainId: number) {
  const client = getPublicClient(chainId) as PublicClient
  const chainCfg = SUPPORTED_CHAINS[chainId]
  if (!chainCfg?.betFactoryAddress) return

  const cursorKey = `bet_listener_last_block_${chainId}`
  const currentBlock = await client.getBlockNumber()
  const cursor = await prisma.cursor.findUnique({ where: { key: cursorKey } })
  const fromBlock = cursor ? BigInt(cursor.value) + 1n : currentBlock
  if (fromBlock > currentBlock) return

  let chunkStart = fromBlock
  while (chunkStart <= currentBlock) {
    const chunkEnd = chunkStart + MAX_BLOCK_RANGE - 1n > currentBlock
      ? currentBlock
      : chunkStart + MAX_BLOCK_RANGE - 1n

    await pollBetCreatedEvents(client, chainId, chainCfg.betFactoryAddress, chunkStart, chunkEnd)
    await pollTrackedBetEvents(client, chainId, chunkStart, chunkEnd)

    await prisma.cursor.upsert({
      where: { key: cursorKey },
      update: { value: chunkEnd.toString() },
      create: { key: cursorKey, value: chunkEnd.toString() },
    })

    chunkStart = chunkEnd + 1n
  }
}

async function pollBetCreatedEvents(client: PublicClient, chainId: number, factoryAddress: string, fromBlock: bigint, toBlock: bigint) {
  const logs = await client.getLogs({
    address: getAddress(factoryAddress),
    event: {
      type: "event",
      name: "BetCreated",
      inputs: [
        { name: "betId", type: "uint256", indexed: true },
        { name: "betContract", type: "address", indexed: false },
        { name: "creator", type: "address", indexed: true },
        { name: "token", type: "address", indexed: false },
        { name: "asset", type: "string", indexed: false },
      ],
    },
    fromBlock,
    toBlock,
  })

  for (const log of logs as any[]) {
    await handleBetCreated(client, chainId, log)
  }
}

async function pollTrackedBetEvents(client: PublicClient, chainId: number, fromBlock: bigint, toBlock: bigint) {
  const tracked = await prisma.bet.findMany({
    where: { contractAddress: { not: null }, chainId },
    select: { id: true, contractAddress: true },
  })

  const trackedX = await prisma.xProposal.findMany({
    where: { contractAddress: { not: null }, chainId },
    select: { id: true, contractAddress: true, type: true },
  })

  type AddressRefs = { betIds: number[]; pricePropIds: number[]; eventPropIds: number[] }
  const addresses = new Map<string, AddressRefs>()
  const ensureEntry = (key: string): AddressRefs => {
    let entry = addresses.get(key)
    if (!entry) {
      entry = { betIds: [], pricePropIds: [], eventPropIds: [] }
      addresses.set(key, entry)
    }
    return entry
  }

  for (const bet of tracked) {
    const key = getAddress(bet.contractAddress!).toLowerCase()
    ensureEntry(key).betIds.push(bet.id)
  }

  for (const proposal of trackedX) {
    const key = getAddress(proposal.contractAddress!).toLowerCase()
    const entry = ensureEntry(key)
    if (proposal.type === "EVENT_BET") entry.eventPropIds.push(proposal.id)
    else entry.pricePropIds.push(proposal.id)
  }

  for (const [address, refs] of addresses) {
    const logs = await client.getLogs({
      address: getAddress(address),
      fromBlock,
      toBlock,
      events: [
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
        {
          type: "event",
          name: "Claimed",
          inputs: [
            { name: "player", type: "address", indexed: true },
            { name: "amount", type: "uint256", indexed: false },
          ],
        },
      ],
    })

    // Resolve the feed decimals once per Bet contract (cached across calls).
    // BetLocked/BetSettled events carry the scaled price but not the scale,
    // so we must look it up to format correctly regardless of feed decimals.
    let feedDecimals: number | null = null
    const resolveDecimals = async () => {
      if (feedDecimals === null) {
        feedDecimals = await getFeedDecimalsForBet(client, getAddress(address))
      }
      return feedDecimals
    }

    for (const log of logs as any[]) {
      if (log.eventName === "BetPlaced") {
        for (const betId of refs.betIds) await handleTelegramBetPlaced(betId, log)
        for (const proposalId of refs.pricePropIds) await handleXBetPlaced(proposalId, log)
        for (const proposalId of refs.eventPropIds) await handleXEventBetPlaced(proposalId, log)
      } else if (log.eventName === "BetLocked") {
        const decimals = await resolveDecimals()
        for (const betId of refs.betIds) await handleTelegramBetLocked(betId, log, decimals)
        for (const proposalId of refs.pricePropIds) await handleXBetLocked(proposalId, log, decimals)
      } else if (log.eventName === "BetSettled") {
        const decimals = await resolveDecimals()
        for (const betId of refs.betIds) await handleTelegramBetSettled(betId, log, decimals)
        for (const proposalId of refs.pricePropIds) await handleXBetSettled(proposalId, log, decimals)
      } else if (log.eventName === "Claimed") {
        for (const betId of refs.betIds) await handleBetClaimed(betId, log)
      }
    }
  }
}

async function handleBetCreated(client: PublicClient, chainId: number, log: any) {
  const onChainBetId = Number(log.args.betId)
  const contractAddress = getAddress(log.args.betContract)
  const creator = String(log.args.creator).toLowerCase()
  const asset = String(log.args.asset)

  const deadline = await client.readContract({
    address: contractAddress,
    abi: BetAbi as any,
    functionName: "bettingDeadline",
  } as any)

  await enqueueVerification({
    contractAddress,
    kind: "BET",
    txHash: log.transactionHash,
  })

  const tgBet = await prisma.bet.findFirst({
    where: { status: "PROPOSED", asset, contractAddress: null, chainId },
    orderBy: { createdAt: "desc" },
  })

  if (tgBet) {
    await prisma.bet.update({
      where: { id: tgBet.id },
      data: {
        betId: onChainBetId,
        contractAddress,
        chainId,
        status: "OPEN",
        bettingDeadline: new Date(Number(deadline) * 1000),
        txHash: log.transactionHash,
      },
    })
    await updateTelegramBetOpen(tgBet.id)
  }

  const proposal = await prisma.xProposal.findFirst({
    where: { status: "PROPOSED", contractAddress: null, creatorWallet: creator, chainId },
    orderBy: { createdAt: "desc" },
  })

  if (proposal) {
    await prisma.xProposal.update({
      where: { id: proposal.id },
      data: {
        contractAddress,
        onChainBetId,
        chainId,
        status: "OPEN",
        bettingDeadline: new Date(Number(deadline) * 1000),
      },
    })
    await announceXOpen(proposal.id)
  }
}

async function handleTelegramBetPlaced(dbBetId: number, log: any) {
  const playerAddress = String(log.args.player).toLowerCase()
  const side = Number(log.args.side) === 0 ? "UP" : "DOWN"
  const amount = Number(formatUnits(log.args.amount, 6))
  const user = await prisma.user.findFirst({ where: { walletAddress: playerAddress } })

  if (user) {
    await prisma.position.upsert({
      where: { betId_tgId: { betId: dbBetId, tgId: user.tgId } },
      update: { side, amount },
      create: { betId: dbBetId, tgId: user.tgId, side, amount },
    })
  }

  const bet = await prisma.bet.findUnique({ where: { id: dbBetId } })
  if (!bet) return

  await prisma.bet.update({
    where: { id: dbBetId },
    data: side === "UP" ? { totalUp: Number(bet.totalUp) + amount } : { totalDown: Number(bet.totalDown) + amount },
  })

  await updateTelegramBetOpen(dbBetId)
}

async function handleTelegramBetLocked(dbBetId: number, log: any, decimals: number) {
  const bet = await prisma.bet.update({
    where: { id: dbBetId },
    data: {
      status: "LOCKED",
      startPrice: formatUnits(log.args.startPrice < 0n ? -log.args.startPrice : log.args.startPrice, decimals),
      startTime: new Date(Number(log.args.startTime) * 1000),
      endTime: new Date(Number(log.args.endTime) * 1000),
    },
  })

  if (!bet.chatId || !bet.messageId) return

  await bot.telegram.editMessageText(
    Number(bet.chatId),
    Number(bet.messageId),
    undefined,
    betLockedMessage(
      bet.asset,
      bet.startPrice || "?",
      bet.endTime?.toUTCString() || "TBD",
      String(bet.totalUp),
      String(bet.totalDown)
    ),
    { parse_mode: "Markdown" }
  ).catch(() => {})
}

async function handleTelegramBetSettled(dbBetId: number, log: any, decimals: number) {
  const formattedEndPrice = formatUnits(log.args.endPrice < 0n ? -log.args.endPrice : log.args.endPrice, decimals)
  const winningSide = log.args.isDraw ? null : (Number(log.args.winningSide) === 0 ? "UP" : "DOWN")
  const bet = await prisma.bet.update({
    where: { id: dbBetId },
    data: {
      status: "SETTLED",
      endPrice: formattedEndPrice,
      winningSide,
      isDraw: Boolean(log.args.isDraw),
      txHash: log.transactionHash,
    },
  })

  if (!bet.chatId || !bet.messageId || !bet.contractAddress) return

  await bot.telegram.editMessageText(
    Number(bet.chatId),
    Number(bet.messageId),
    undefined,
    betSettledMessage(
      bet.asset,
      bet.startPrice || "?",
      formattedEndPrice,
      winningSide || "DRAW",
      Boolean(log.args.isDraw),
      (Number(bet.totalUp) + Number(bet.totalDown)).toFixed(2),
      Number(bet.totalUp) === 0 || Number(bet.totalDown) === 0
    ),
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.url("💰 View Bet", `${config.WEBAPP_URL}/bet/${bet.contractAddress}?chainId=${bet.chainId}`)],
      ]),
    }
  ).catch(() => {})
}

async function handleBetClaimed(dbBetId: number, log: any) {
  const playerAddress = String(log.args.player).toLowerCase()
  const user = await prisma.user.findFirst({ where: { walletAddress: playerAddress } })
  if (!user) return

  await prisma.position.updateMany({
    where: { betId: dbBetId, tgId: user.tgId },
    data: { claimed: true },
  })
}

async function updateTelegramBetOpen(dbBetId: number) {
  const bet = await prisma.bet.findUnique({ where: { id: dbBetId } })
  if (!bet || !bet.chatId || !bet.messageId || !bet.contractAddress) return

  const upCount = await prisma.position.count({ where: { betId: dbBetId, side: "UP" } })
  const downCount = await prisma.position.count({ where: { betId: dbBetId, side: "DOWN" } })

  await bot.telegram.editMessageText(
    Number(bet.chatId),
    Number(bet.messageId),
    undefined,
    betOpenMessage(
      bet.asset,
      bet.contractAddress,
      bet.bettingDeadline?.toUTCString() || "TBD",
      String(bet.totalUp),
      String(bet.totalDown),
      upCount,
      downCount
    ),
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.url("📈 I'm UP", `${config.WEBAPP_URL}/bet/${bet.contractAddress}?chainId=${bet.chainId}&side=up`)],
        [Markup.button.url("📉 I'm DOWN", `${config.WEBAPP_URL}/bet/${bet.contractAddress}?chainId=${bet.chainId}&side=down`)],
      ]),
    }
  ).catch(() => {})
}

async function handleXBetPlaced(proposalId: number, log: any) {
  const side = Number(log.args.side) === 0 ? "UP" : "DOWN"
  const amount = Number(formatUnits(log.args.amount, 6))
  const proposal = await prisma.xProposal.findUnique({ where: { id: proposalId } })
  if (!proposal) return

  await prisma.xProposal.update({
    where: { id: proposalId },
    data: side === "UP" ? { totalUp: Number(proposal.totalUp) + amount } : { totalDown: Number(proposal.totalDown) + amount },
  })
}

async function handleXEventBetPlaced(proposalId: number, log: any) {
  const side = Number(log.args.side) === 0 ? "YES" : "NO"
  const amount = Number(formatUnits(log.args.amount, 6))
  const proposal = await prisma.xProposal.findUnique({ where: { id: proposalId } })
  if (!proposal) return

  await prisma.xProposal.update({
    where: { id: proposalId },
    data: side === "YES"
      ? { totalYes: Number(proposal.totalYes) + amount }
      : { totalNo: Number(proposal.totalNo) + amount },
  })
}

async function handleXBetLocked(proposalId: number, log: any, decimals: number) {
  await prisma.xProposal.update({
    where: { id: proposalId },
    data: {
      status: "LOCKED",
      startPrice: formatUnits(log.args.startPrice < 0n ? -log.args.startPrice : log.args.startPrice, decimals),
      startTime: new Date(Number(log.args.startTime) * 1000),
      endTime: new Date(Number(log.args.endTime) * 1000),
    },
  })
}

async function handleXBetSettled(proposalId: number, log: any, decimals: number) {
  const winningSide = log.args.isDraw ? null : (Number(log.args.winningSide) === 0 ? "UP" : "DOWN")
  const proposal = await prisma.xProposal.update({
    where: { id: proposalId },
    data: {
      status: "SETTLED",
      winningSide,
      isDraw: Boolean(log.args.isDraw),
      endPrice: formatUnits(log.args.endPrice < 0n ? -log.args.endPrice : log.args.endPrice, decimals),
    },
  })

  if (!proposal.contractAddress || proposal.settlementTweetId || !proposal.announcementTweetId) return

  const text = [
    `${proposal.asset} prediction has settled: ${proposal.isDraw ? "DRAW" : proposal.winningSide}.`,
    `Start price ${proposal.startPrice || "?"}, end price ${proposal.endPrice || "?"}.`,
    `POP: ${publicWebappUrl}/bet/${proposal.contractAddress}?chainId=${proposal.chainId}&action=claim`,
  ].join("\n")

  const tweet = await createTweet({
    text,
    replyToTweetId: proposal.announcementTweetId,
  })

  await prisma.xProposal.update({
    where: { id: proposalId },
    data: { settlementTweetId: tweet.id },
  })
}

async function announceXOpen(proposalId: number) {
  const proposal = await prisma.xProposal.findUnique({ where: { id: proposalId } })
  if (!proposal || !proposal.contractAddress || proposal.announcementTweetId) return

  const creator = proposal.creatorUsername ? `@${proposal.creatorUsername}` : "the creator"
  const originalUrl = proposal.creatorUsername
    ? tweetUrl(proposal.creatorUsername, proposal.tweetId)
    : `https://x.com/i/web/status/${proposal.tweetId}`

  const tweet = await createTweet({
    text: [
      `${creator}'s ${proposal.asset} ${Math.round(proposal.duration / 60)}m prediction market is now live on-chain.`,
      `Join here: ${publicWebappUrl}/bet/${proposal.contractAddress}?chainId=${proposal.chainId}`,
      `Original post: ${originalUrl}`,
    ].join("\n"),
    replyToTweetId: proposal.proposalReplyTweetId || proposal.tweetId,
  })

  await prisma.xProposal.update({
    where: { id: proposalId },
    data: { announcementTweetId: tweet.id },
  })
}
