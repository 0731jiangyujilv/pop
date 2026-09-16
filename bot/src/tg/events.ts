import { getAddress, formatUnits } from "viem"
import { Markup } from "telegraf"
import { publicClient, BetFactoryAbi, BetAbi } from "../common/services/blockchain"
import { config } from "../common/config"
import { prisma } from "../common/db"
import { bot, formatDuration } from "./bot"
import {
  betOpenMessage,
  betLockedMessage,
  betSettledMessage,
} from "./messages"

const POLL_INTERVAL = 5_000 // 5 seconds

let lastProcessedBlock: bigint | null = null

/**
 * Start polling for on-chain events from BetFactory and individual Bet contracts.
 * v2: Listens for BetCreated, BetPlaced, BetLocked, BetSettled, Claimed.
 */
export async function startEventListener() {
  console.log("👁 Starting on-chain event listener (v2)...")

  lastProcessedBlock = await publicClient.getBlockNumber()
  console.log(`👁 Listening from block ${lastProcessedBlock}`)

  setInterval(pollEvents, POLL_INTERVAL)
}

async function pollEvents() {
  try {
    const currentBlock = await publicClient.getBlockNumber()
    if (lastProcessedBlock === null || currentBlock <= lastProcessedBlock) return

    const fromBlock = lastProcessedBlock + 1n
    const toBlock = currentBlock

    // Advance block pointer FIRST to avoid reprocessing on handler errors
    lastProcessedBlock = toBlock

    await pollBetCreatedEvents(fromBlock, toBlock)
    await pollBetContractEvents(fromBlock, toBlock)
  } catch (err) {
    console.error("👁 Event polling error:", err)
  }
}

// --- BetCreated from BetFactory ---

async function pollBetCreatedEvents(fromBlock: bigint, toBlock: bigint) {
  const logs = await publicClient.getLogs({
    address: getAddress(config.BET_FACTORY_ADDRESS),
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

  for (const log of logs) {
    await handleBetCreated(log)
  }
}

async function handleBetCreated(log: any) {
  const { betId, betContract, creator, asset } = log.args
  const onChainBetId = Number(betId)
  const contractAddr = betContract as string

  console.log(`👁 BetCreated: #${onChainBetId} at ${contractAddr} by ${creator}`)

  // Skip if this on-chain betId is already recorded for this contract
  const existing = await prisma.bet.findFirst({
    where: { betId: onChainBetId, contractAddress: contractAddr },
  })
  if (existing) {
    console.log(`👁 BetCreated #${onChainBetId}: already processed, skipping`)
    return
  }

  // Clear stale rows that have the same onChainBetId from old factory deployments
  const stale = await prisma.bet.findFirst({
    where: { betId: onChainBetId },
  })
  if (stale) {
    console.warn(`👁 BetCreated #${onChainBetId}: clearing stale betId from DB bet #${stale.id}`)
    await prisma.bet.update({
      where: { id: stale.id },
      data: { betId: null },
    })
  }

  // Find matching PROPOSED bet by asset + creator wallet
  // The WebApp notifies the API which updates status, but event listener is the fallback
  const bet = await prisma.bet.findFirst({
    where: {
      status: "PROPOSED",
      asset,
      contractAddress: null,
    },
    orderBy: { createdAt: "desc" },
  })

  if (!bet) {
    console.warn(`👁 BetCreated #${onChainBetId}: no matching DB bet found (may be already linked)`)
    return
  }

  // Read bettingDeadline from contract
  let deadline: Date | null = null
  try {
    const dl = await publicClient.readContract({
      address: getAddress(contractAddr),
      abi: BetAbi,
      functionName: "bettingDeadline",
    })
    deadline = new Date(Number(dl) * 1000)
  } catch (_) {}

  await prisma.bet.update({
    where: { id: bet.id },
    data: {
      betId: onChainBetId,
      contractAddress: contractAddr,
      status: "OPEN",
      bettingDeadline: deadline,
      txHash: log.transactionHash,
    },
  })

  await updateTelegramBetOpen(bet.id)
}

async function updateTelegramBetOpen(dbBetId: number) {
  const bet = await prisma.bet.findUnique({ where: { id: dbBetId } })
  if (!bet || !bet.chatId || !bet.messageId || !bet.contractAddress) {
    console.warn(`⚠️ Cannot update Telegram: bet #${dbBetId} missing chatId/messageId/contractAddress`)
    return
  }

  const chatId = Number(bet.chatId)
  const messageId = Number(bet.messageId)

  const upCount = await prisma.position.count({ where: { betId: dbBetId, side: "UP" } })
  const downCount = await prisma.position.count({ where: { betId: dbBetId, side: "DOWN" } })

  const explorerUrl = `https://sepolia.basescan.org/address/${bet.contractAddress}`
  const joinUrl = `${config.WEBAPP_URL}/bet/${bet.contractAddress}?chainId=${bet.chainId}`
  const deadlineStr = bet.bettingDeadline ? bet.bettingDeadline.toUTCString() : "TBD"

  const msg = betOpenMessage(
    bet.asset,
    bet.contractAddress,
    deadlineStr,
    String(bet.totalUp),
    String(bet.totalDown),
    upCount,
    downCount
  )

  try {
    // Update the original message with bet details
    await bot.telegram.editMessageText(
      chatId,
      messageId,
      undefined,
      msg,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.url("📈 I'm UP", joinUrl + "?side=up")],
          [Markup.button.url("📉 I'm DOWN", joinUrl + "?side=down")],
          [Markup.button.url("📋 View Contract", explorerUrl)],
        ]),
      }
    )

    // Send a follow-up message encouraging sharing (only if this is the first update)
    if (upCount + downCount === 1) {
      const shareMsg = [
        "🎉 *Bet is now live on-chain!*",
        "",
        "✨ Share this bet with your friends!",
        "💰 The more players, the bigger the prize pool!",
        "",
        "Click the buttons above to join 👆",
      ].join("\n")

      await bot.telegram.sendMessage(chatId, shareMsg, {
        parse_mode: "Markdown",
        reply_parameters: { message_id: messageId },
      })
    }
  } catch (err: any) {
    console.error(`👁 Failed to update Telegram for bet #${dbBetId} in chat ${chatId}:`, err.message)
  }
}

// --- Events from individual Bet contracts ---

async function pollBetContractEvents(fromBlock: bigint, toBlock: bigint) {
  const activeBets = await prisma.bet.findMany({
    where: {
      contractAddress: { not: null },
      status: { in: ["OPEN", "LOCKED"] },
    },
    select: { id: true, contractAddress: true },
  })

  if (activeBets.length === 0) return

  for (const bet of activeBets) {
    if (!bet.contractAddress) continue
    const addr = getAddress(bet.contractAddress)

    const logs = await publicClient.getLogs({
      address: addr,
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
      ],
      fromBlock,
      toBlock,
    })

    for (const log of logs) {
      const eventName = (log as any).eventName
      if (eventName === "BetPlaced") {
        await handleBetPlaced(bet.id, log as any)
      } else if (eventName === "BetLocked") {
        await handleBetLocked(bet.id, log as any)
      } else if (eventName === "BetSettled") {
        await handleBetSettled(bet.id, log as any)
      }
    }
  }
}

async function handleBetPlaced(dbBetId: number, log: any) {
  const { player, side, amount } = log.args
  const playerAddr = (player as string).toLowerCase()
  const sideStr = Number(side) === 0 ? "UP" : "DOWN"
  const amountFormatted = formatUnits(amount, 6) // USDC has 6 decimals

  console.log(`👁 BetPlaced: bet #${dbBetId}, ${playerAddr} → ${sideStr} ${amountFormatted} USDC`)

  // Find user by wallet address
  const user = await prisma.user.findFirst({
    where: { walletAddress: playerAddr },
  })

  const tgId = user?.tgId || BigInt(0) // Unknown user if not linked
  const username = user?.username || "Unknown"

  // Upsert position
  if (tgId !== BigInt(0)) {
    await prisma.position.upsert({
      where: { betId_tgId: { betId: dbBetId, tgId } },
      update: { side: sideStr, amount: parseFloat(amountFormatted) },
      create: { betId: dbBetId, tgId, side: sideStr, amount: parseFloat(amountFormatted) },
    })
  }

  // Update bet totals
  const bet = await prisma.bet.findUnique({ where: { id: dbBetId } })
  if (!bet) return

  const updateData: any = {}
  if (sideStr === "UP") {
    updateData.totalUp = Number(bet.totalUp) + parseFloat(amountFormatted)
  } else {
    updateData.totalDown = Number(bet.totalDown) + parseFloat(amountFormatted)
  }

  await prisma.bet.update({ where: { id: dbBetId }, data: updateData })

  // Refresh Telegram message with updated pools
  await updateTelegramBetOpen(dbBetId)

  // Send notification to the group about new player (skip creator's first bet)
  const totalPlayers = await prisma.position.count({ where: { betId: dbBetId } })
  if (totalPlayers > 1 && bet.chatId) {
    const playerName = username !== "Unknown" ? `@${username}` : `${playerAddr.slice(0, 6)}...${playerAddr.slice(-4)}`
    const notifMsg = `${sideStr === "UP" ? "📈" : "📉"} ${playerName} joined ${sideStr} with ${amountFormatted} USDC!`
    
    try {
      await bot.telegram.sendMessage(Number(bet.chatId), notifMsg, 
        bet.messageId ? { reply_parameters: { message_id: Number(bet.messageId) } } : {}
      )
    } catch (err: any) {
      console.error(`Failed to send BetPlaced notification to chat ${bet.chatId}:`, err.message)
    }
  }
}

async function handleBetLocked(dbBetId: number, log: any) {
  const { startPrice, startTime, endTime } = log.args

  console.log(`👁 BetLocked: bet #${dbBetId}, startPrice=${startPrice}`)

  const formattedPrice = formatUnits(startPrice < 0n ? -startPrice : startPrice, 8)
  const endDate = new Date(Number(endTime) * 1000)

  await prisma.bet.update({
    where: { id: dbBetId },
    data: {
      status: "LOCKED",
      startPrice: formattedPrice,
      startTime: new Date(Number(startTime) * 1000),
      endTime: endDate,
    },
  })

  const bet = await prisma.bet.findUnique({ where: { id: dbBetId } })
  if (!bet || !bet.chatId || !bet.messageId) return

  try {
    await bot.telegram.editMessageText(
      Number(bet.chatId),
      Number(bet.messageId),
      undefined,
      betLockedMessage(
        bet.asset,
        formattedPrice,
        endDate.toUTCString(),
        String(bet.totalUp),
        String(bet.totalDown)
      ),
      { parse_mode: "Markdown" }
    )
  } catch (err) {
    console.error("👁 Failed to update Telegram for BetLocked:", err)
  }
}

async function handleBetSettled(dbBetId: number, log: any) {
  const { winningSide, isDraw, endPrice } = log.args

  console.log(`👁 BetSettled: bet #${dbBetId}, winningSide=${winningSide}, isDraw=${isDraw}`)

  const formattedEndPrice = formatUnits(endPrice < 0n ? -endPrice : endPrice, 8)
  const sideStr = isDraw ? null : (Number(winningSide) === 0 ? "UP" : "DOWN")

  const bet = await prisma.bet.findUnique({ where: { id: dbBetId } })
  if (!bet) return

  await prisma.bet.update({
    where: { id: dbBetId },
    data: {
      status: "SETTLED",
      endPrice: formattedEndPrice,
      winningSide: sideStr,
      isDraw: isDraw as boolean,
      txHash: log.transactionHash,
    },
  })

  if (!bet.chatId || !bet.messageId || !bet.contractAddress) return

  const totalPool = (Number(bet.totalUp) + Number(bet.totalDown)).toFixed(2)
  const isNoContest = (Number(bet.totalUp) === 0) || (Number(bet.totalDown) === 0)
  const claimUrl = `${config.WEBAPP_URL}/bet/${bet.contractAddress}?chainId=${bet.chainId}&action=claim`

  try {
    const msg = betSettledMessage(
      bet.asset,
      bet.startPrice || "?",
      formattedEndPrice,
      sideStr || "DRAW",
      isDraw as boolean,
      totalPool,
      isNoContest
    )

    await bot.telegram.editMessageText(
      Number(bet.chatId),
      Number(bet.messageId),
      undefined,
      msg,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.url("💰 Claim Payout", claimUrl)],
        ]),
      }
    )
  } catch (err) {
    console.error("👁 Failed to update Telegram for BetSettled:", err)
  }
}
