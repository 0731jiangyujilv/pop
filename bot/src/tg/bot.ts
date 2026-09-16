import { Telegraf, Markup } from "telegraf"
import type { Context } from "telegraf"
import { message } from "telegraf/filters"
import { config } from "../common/config"
import { prisma } from "../common/db"
import { parseBetIntent } from "../common/services/openai"
import { isAssetSupported } from "../common/services/oracle-registry"
import {
  welcomeMessage,
  rulesMessage,
  helpMessage,
  betProposalMessage,
  parseConfirmMessage,
  noBetsMessage,
} from "./messages"

export const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN)

// --- /start ---
bot.start(async (ctx) => {
  await handleStart(ctx)
})

// --- /rules ---
bot.command("rules", async (ctx) => {
  await handleRules(ctx)
})

// --- /help ---
bot.help(async (ctx) => {
  await handleHelp(ctx)
})

// --- /mybets ---
bot.command("mybets", async (ctx) => {
  await handleMyBets(ctx)
})

// --- /stats ---
bot.command("stats", async (ctx) => {
  await handleStats(ctx)
})

// --- /bet or natural language ---
bot.command("bet", handleBetCommand)
bot.on(message("text"), async (ctx) => {
  const text = ctx.message.text
  console.log(`[BOT] text event from ${ctx.from?.id} in chat ${ctx.chat?.id}: "${text}"`)

  // 处理斜杠命令（支持群聊中的命令）
  if (text.startsWith("/")) {
    const command = text.split(/\s+/)[0].substring(1).split("@")[0]

    console.log("command", command)
    
    // 手动处理命令
    switch (command) {
      case "start":
        await handleStart(ctx)
        return
      case "rules":
        await handleRules(ctx)
        return
      case "help":
        await handleHelp(ctx)
        return
      case "mybets":
        await handleMyBets(ctx)
        return
      case "stats":
        await handleStats(ctx)
        return
      case "bet":
        await handleBetCommand(ctx)
        return
      default:
        // 其他命令由 bot.command() 处理
        return
    }
  }


  // Skip very short messages
  if (text.length < 3) { console.log("[BOT] skipping: too short"); return }

  // Check if bot is explicitly mentioned
  const botUsername = ctx.botInfo.username
  console.log(`[BOT] botUsername=${botUsername}, mentioned=${text.includes(`@${botUsername}`)}`)
  if (!text.includes(`@${botUsername}`)) { console.log("[BOT] skipping: bot not mentioned"); return }

  // Strip the bot mention
  const cleaned = text.replace(`@${botUsername}`, "").trim()
  console.log(`[BOT] cleaned text: "${cleaned}"`)
  if (!cleaned) return

  await processBetMessage(ctx, cleaned)
})

// --- Callback queries for inline keyboards ---
bot.on("callback_query", async (ctx) => {
  const data = (ctx.callbackQuery as any).data as string | undefined
  console.log(`[BOT] callback_query from ${ctx.from?.id}: data="${data}"`)
  if (!data) return

  if (data.startsWith("confirm_bet:")) {
    await handleConfirmBet(ctx, data)
  } else if (data === "cancel_bet") {
    await handleCancelProposal(ctx)
  } else if (data.startsWith("edit_asset:")) {
    await handleEditAsset(ctx, data)
  } else if (data.startsWith("edit_duration:")) {
    await handleEditDuration(ctx, data)
  } else if (data.startsWith("edit_range:")) {
    await handleEditRange(ctx, data)
  } else if (data.startsWith("set_duration:")) {
    await handleSetDuration(ctx, data)
  } else if (data.startsWith("set_range:")) {
    await handleSetRange(ctx, data)
  } else if (data.startsWith("back_to_proposal:")) {
    await handleBackToProposal(ctx, data)
  }

  await ctx.answerCbQuery()
})

// --- Handlers ---

async function handleBetCommand(ctx: Context) {
  const text = (ctx.message as any)?.text as string
  const parts = text.replace("/bet", "").trim()
  console.log(`[BOT] /bet command: "${parts}"`)
  if (!parts) {
    await ctx.replyWithMarkdown(
      "Please describe your bet, e.g.:\n`/bet BTC 5m`\n`/bet LINK 1h`"
    )
    return
  }
  await processBetMessage(ctx, parts)
}

async function handleStart(ctx: Context) {
  await ctx.replyWithMarkdown(welcomeMessage())
}

async function handleRules(ctx: Context) {
  await ctx.replyWithMarkdown(rulesMessage())
}

async function handleHelp(ctx: Context) {
  await ctx.replyWithMarkdown(helpMessage())
}

async function handleMyBets(ctx: Context) {
  if (!ctx.from) return
  const tgId = BigInt(ctx.from.id)

  // Find bets where user is creator or has a position
  const positions = await prisma.position.findMany({
    where: { tgId },
    select: { betId: true },
  })
  const positionBetIds = positions.map((p) => p.betId)

  const bets = await prisma.bet.findMany({
    where: {
      OR: [
        { creatorTgId: tgId },
        { id: { in: positionBetIds } },
      ],
      status: { notIn: ["SETTLED", "CANCELLED", "EXPIRED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  })

  if (bets.length === 0) {
    await ctx.replyWithMarkdown(noBetsMessage())
    return
  }

  const lines = ["📋 *Your Active Bets:*", ""]
  for (const bet of bets) {
    const statusEmoji =
      bet.status === "PROPOSED" ? "📝" :
      bet.status === "OPEN" ? "🎲" :
      bet.status === "LOCKED" ? "🔒" : "❓"

    const total = (Number(bet.totalUp) + Number(bet.totalDown)).toFixed(0)
    lines.push(`${statusEmoji} #${bet.id} | ${bet.asset} | Pool: ${total} USDC | ${bet.status}`)
  }

  await ctx.replyWithMarkdown(lines.join("\n"))
}

async function handleStats(ctx: Context) {
  try {
    // Fetch stats from API
    const response = await fetch(`${config.API_BASE_URL}/api/stats`)
    if (!response.ok) {
      throw new Error(`Failed to fetch stats: ${response.status}`)
    }
    const stats: any = await response.json()

    // Fetch leaderboard
    const leaderboardResponse = await fetch(`${config.API_BASE_URL}/api/stats/leaderboard?limit=5`)
    const leaderboardData = leaderboardResponse.ok ? await leaderboardResponse.json() : []
    const leaderboard: any[] = Array.isArray(leaderboardData) ? leaderboardData : []

    const lines = [
      "📊 *Platform Statistics*",
      "",
      "🎲 *Betting Activity*",
      `• Total Bets: ${stats.totalBetsCount}`,
      `• Active Bets: ${stats.activeBetsCount}`,
      `• Settled Bets: ${stats.settledBetsCount}`,
      "",
      "💰 *Volume*",
      `• Total Volume: ${parseFloat(stats.totalVolume).toFixed(2)} USDC`,
      "",
    ]

    if (leaderboard.length > 0) {
      lines.push("🏆 *Top Players*")
      leaderboard.slice(0, 5).forEach((player: any, index: number) => {
        const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`
        const profit = parseFloat(player.totalProfit).toFixed(2)
        const profitSign = parseFloat(player.totalProfit) >= 0 ? "+" : ""
        lines.push(`${medal} ${player.username}: ${profitSign}${profit} USDC (${player.winRate.toFixed(1)}% WR)`)
      })
      lines.push("")
    }

    lines.push("🔗 *Verified On-Chain*")
    lines.push("All data is verified using Chainlink Proof of Reserve")
    lines.push("")
    lines.push("📈 View detailed statistics:")

    await ctx.replyWithMarkdown(lines.join("\n"), {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📊 View Full Statistics", url: `${config.WEBAPP_URL}/stats` }]
        ]
      }
    })
  } catch (error) {
    console.error("[BOT] /stats error:", error)
    await ctx.reply("Failed to fetch statistics. Please try again later.")
  }
}

async function processBetMessage(ctx: Context, text: string) {
  console.log(`[BOT] processBetMessage: "${text}"`)
  const thinking = await ctx.reply("🤖 Analyzing your bet intent...")

  const intent = await parseBetIntent(text)
  console.log(`[BOT] parseBetIntent result:`, JSON.stringify(intent))

  // Validate parsed intent
  if (intent.confidence < 0.5 || !intent.asset || !intent.duration) {
    console.log(`[BOT] intent rejected: confidence=${intent.confidence}, asset=${intent.asset}, duration=${intent.duration}`)
    const missing: string[] = []
    if (!intent.asset) missing.push("asset (BTC/USD, LINK/USD, or VIRTUAL/USD)")
    if (!intent.duration) missing.push("duration (e.g. 5m, 1h)")

    let msg = parseConfirmMessage(intent)
    if (missing.length > 0) {
      msg += `\n\n❌ Missing info: ${missing.join(", ")}`
      msg += "\n\nPlease try again, e.g.:\n`@bot BTC 5m`"
    }

    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      thinking.message_id,
      undefined,
      msg,
      { parse_mode: "Markdown" }
    )
    return
  }

  if (!(await isAssetSupported(intent.asset))) {
    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      thinking.message_id,
      undefined,
      `⏳ ${intent.asset} is not supported yet. Coming soon.`,
      { parse_mode: "Markdown" }
    )
    return
  }

  // Ensure creator user exists
  const fromUser = ctx.from!
  await prisma.user.upsert({
    where: { tgId: BigInt(fromUser.id) },
    update: { username: fromUser.username || null },
    create: { tgId: BigInt(fromUser.id), username: fromUser.username || null },
  })

  // Store bet proposal in DB
  console.log(`[BOT] creating bet proposal: asset=${intent.asset}, duration=${intent.duration}, creator=${fromUser.id}`)
  const tempBet = await prisma.bet.create({
    data: {
      creatorTgId: BigInt(fromUser.id),
      asset: intent.asset!,
      minAmount: 1, // default 1 USDC
      maxAmount: 1000, // default 1000 USDC
      duration: intent.duration!,
      chatId: BigInt(ctx.chat!.id),
      status: "PROPOSED",
    },
  })
  console.log(`[BOT] bet proposal created: id=${tempBet.id}`)

  const creatorUsername = fromUser.username || String(fromUser.id)
  const confirmMsg = betProposalMessage(
    creatorUsername,
    tempBet.asset,
    tempBet.duration,
    Number(tempBet.minAmount),
    Number(tempBet.maxAmount),
    1800 // default 30 minutes betting window
  )

  await ctx.telegram.editMessageText(
    ctx.chat!.id,
    thinking.message_id,
    undefined,
    confirmMsg,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("📈 Edit Asset", `edit_asset:${tempBet.id}`)],
        [
          Markup.button.callback("⏱ Edit Duration", `edit_duration:${tempBet.id}`),
          Markup.button.callback("💰 Edit Range", `edit_range:${tempBet.id}`),
        ],
        [Markup.button.callback("✅ Confirm & Create", `confirm_bet:${tempBet.id}`)],
        [Markup.button.callback("❌ Cancel", "cancel_bet")],
      ]),
    }
  )
}

async function handleConfirmBet(ctx: Context, data: string) {
  const betId = parseInt(data.split(":")[1])
  console.log(`[BOT] handleConfirmBet: betId=${betId}`)

  const bet = await prisma.bet.findUnique({ where: { id: betId } })
  console.log(`[BOT] bet lookup: found=${!!bet}, status=${bet?.status}`)
  if (!bet || bet.status !== "PROPOSED") return

  const fromUser = ctx.callbackQuery!.from
  if (BigInt(fromUser.id) !== bet.creatorTgId) {
    await ctx.answerCbQuery("Only the creator can confirm this bet.")
    return
  }

  // Build WebApp URL for creating the bet on-chain (use UUID for idempotency)
  const createUrl = `${config.WEBAPP_URL}/create/${bet.uuid}`
  console.log(`[BOT] createUrl: ${createUrl}`)

  const sent = await ctx.editMessageText(
    [
      "🎯 *Bet Confirmed!*",
      "",
      `� ${bet.asset} | ⏱ ${formatDuration(bet.duration)}`,
      `� Bet range: ${bet.minAmount} - ${bet.maxAmount} USDC`,
      "",
      "Tap below to create the bet on-chain and place your first wager.",
    ].join("\n"),
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.url("� Create Bet (WebApp)", createUrl)],
      ]),
    }
  )

  // Update bet with message ID
  const msgId = (sent as any).message_id
  if (msgId) {
    await prisma.bet.update({
      where: { id: betId },
      data: { messageId: BigInt(msgId) },
    })
  }
}

async function handleCancelProposal(ctx: Context) {
  await ctx.editMessageText("❌ Bet cancelled.")
}

async function handleEditAsset(ctx: Context, data: string) {
  const betId = parseInt(data.split(":")[1])
  await ctx.answerCbQuery("📝 Reply with new asset (e.g., BTC/USD, LINK/USD, VIRTUAL/USD)")
  
  // TODO: Implement conversation state to capture next message as new asset value
  // For now, just show a message
  await ctx.reply("To edit the asset, please create a new bet with the desired asset.")
}

async function handleEditDuration(ctx: Context, data: string) {
  const betId = parseInt(data.split(":")[1])
  const bet = await prisma.bet.findUnique({ where: { id: betId } })
  if (!bet || bet.status !== "PROPOSED") return

  const fromUser = ctx.callbackQuery!.from
  if (BigInt(fromUser.id) !== bet.creatorTgId) {
    await ctx.answerCbQuery("Only the creator can edit this bet.")
    return
  }

  // Quick duration options (minimum 5 minutes)
  const durations = [
    { label: "5 min", value: 300 },
    { label: "15 min", value: 900 },
    { label: "30 min", value: 1800 },
    { label: "1 hour", value: 3600 },
  ]

  await ctx.editMessageReplyMarkup({
    inline_keyboard: [
      ...durations.map(d => [
        Markup.button.callback(`⏱ ${d.label}`, `set_duration:${betId}:${d.value}`)
      ]),
      [Markup.button.callback("« Back", `back_to_proposal:${betId}`)],
    ],
  })
}

async function handleEditRange(ctx: Context, data: string) {
  const betId = parseInt(data.split(":")[1])
  const bet = await prisma.bet.findUnique({ where: { id: betId } })
  if (!bet || bet.status !== "PROPOSED") return

  const fromUser = ctx.callbackQuery!.from
  if (BigInt(fromUser.id) !== bet.creatorTgId) {
    await ctx.answerCbQuery("Only the creator can edit this bet.")
    return
  }

  // Quick range options
  const ranges = [
    { label: "1-100 USDC", min: 1, max: 100 },
    { label: "1-500 USDC", min: 1, max: 500 },
    { label: "10-1000 USDC", min: 10, max: 1000 },
    { label: "1-10000 USDC", min: 1, max: 10000 },
  ]

  await ctx.editMessageReplyMarkup({
    inline_keyboard: [
      ...ranges.map(r => [
        Markup.button.callback(`💰 ${r.label}`, `set_range:${betId}:${r.min}:${r.max}`)
      ]),
      [Markup.button.callback("« Back", `back_to_proposal:${betId}`)],
    ],
  })
}

async function handleSetDuration(ctx: Context, data: string) {
  const parts = data.split(":")
  const betId = parseInt(parts[1])
  const newDuration = Math.max(parseInt(parts[2]), 300) // minimum 5 minutes

  await prisma.bet.update({
    where: { id: betId },
    data: { duration: newDuration },
  })

  await handleBackToProposal(ctx, `back_to_proposal:${betId}`)
}

async function handleSetRange(ctx: Context, data: string) {
  const parts = data.split(":")
  const betId = parseInt(parts[1])
  const newMin = parseInt(parts[2])
  const newMax = parseInt(parts[3])

  await prisma.bet.update({
    where: { id: betId },
    data: { minAmount: newMin, maxAmount: newMax },
  })

  await handleBackToProposal(ctx, `back_to_proposal:${betId}`)
}

async function handleBackToProposal(ctx: Context, data: string) {
  const betId = parseInt(data.split(":")[1])
  const bet = await prisma.bet.findUnique({ where: { id: betId } })
  if (!bet || bet.status !== "PROPOSED") return

  const creator = await prisma.user.findUnique({ where: { tgId: bet.creatorTgId } })
  const creatorUsername = creator?.username || String(bet.creatorTgId)

  const confirmMsg = betProposalMessage(
    creatorUsername,
    bet.asset,
    bet.duration,
    Number(bet.minAmount),
    Number(bet.maxAmount),
    1800
  )

  await ctx.editMessageText(confirmMsg, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("📈 Edit Asset", `edit_asset:${betId}`)],
      [
        Markup.button.callback("⏱ Edit Duration", `edit_duration:${betId}`),
        Markup.button.callback("💰 Edit Range", `edit_range:${betId}`),
      ],
      [Markup.button.callback("✅ Confirm & Create", `confirm_bet:${betId}`)],
      [Markup.button.callback("❌ Cancel", "cancel_bet")],
    ]),
  })
}

// --- Utils ---

export function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hr`
  return `${Math.round(seconds / 86400)} day`
}
