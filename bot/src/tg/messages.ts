import type { ParsedBetIntent } from "../common/services/openai"

export function welcomeMessage(): string {
  return [
    "🎲 *BetSys — Multi-Side Crypto Betting*",
    "",
    "Create betting pools in group chats!",
    "Everyone picks UP or DOWN, winners split the pot.",
    "",
    "📝 *Start a bet:*",
    "Mention me with your intent, e.g.:",
    "`@bet_nvsn_bot BTC 5m`",
    "`@bet_nvsn_bot 开盘 LINK 1h`",
    "`@bet_nvsn_bot VIRTUAL in tomorrow`",
    "`@bet_nvsn_bot VIRTUAL in 3.21`",
    "",
    "📋 *Commands:*",
    "/start — Welcome",
    "/rules — Betting rules",
    "/mybets — My active bets",
    "/help — Help",
    "",
    "⚡ Powered by on-chain contracts and admin-driven oracle settlement",
  ].join("\n")
}

export function rulesMessage(): string {
  return [
    "📜 *Betting Rules*",
    "",
    "1️⃣ *Supported assets:* BTC/USD, LINK/USD, VIRTUAL/USD",
    "2️⃣ *Wager token:* USDC",
    "3️⃣ *Duration:* 5 minutes ~ 7 days",
    "4️⃣ *Sides:* Anyone picks UP or DOWN",
    "",
    "🔄 *Flow:*",
    "1. Someone proposes a bet",
    "2. Creator confirms & creates on-chain via WebApp",
    "3. Anyone joins — pick a side, choose your amount",
    "4. Betting closes → admin reports price and locks the bet",
    "5. Time expires → admin reports price and settles the bet",
    "6. Winners claim proportional payout",
    "",
    "💰 *Winners split the entire pool (minus 2.5% fee)*",
    "📊 *Price unchanged = full refund, no fee*",
    "",
    "⚠️ *Security:*",
    "• All fund logic is on-chain and immutable",
    "• Prices are reported on-chain through the project oracle",
    "• Bot only coordinates and executes admin transactions, never holds user funds",
  ].join("\n")
}

export function helpMessage(): string {
  return [
    "❓ *Help*",
    "",
    "🗣 *Start a bet:*",
    "Mention me in a group chat:",
    "• `@bet_nvsn_bot BTC 5m`",
    "• `@bet_nvsn_bot 开盘 LINK 1h`",
    "• `@bet_nvsn_bot VIRTUAL in tomorrow`",
    "• `@bet_nvsn_bot VIRTUAL in 3.21`",
    "",
    "AI will parse your intent and show a proposal.",
    "Creator creates the contract via WebApp.",
    "Others join by picking a side.",
    "",
    "📊 *View bets:*",
    "/mybets — View your active bets",
  ].join("\n")
}

export function betProposalMessage(
  creatorUsername: string,
  asset: string,
  duration: number,
  minAmount: number,
  maxAmount: number,
  bettingWindow?: number
): string {
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    return `${Math.floor(seconds / 3600)}h`
  }

  const bettingWindowText = bettingWindow ? formatDuration(bettingWindow) : "30m"

  return [
    "🎯 *New Bet Proposal*",
    "",
    `👤 Creator: @${creatorUsername}`,
    "",
    "📊 *Bet Parameters:*",
    `📈 Asset: ${asset}`,
    `⏱ Duration: ${formatDuration(duration)}`,
    `💰 Min Bet: ${minAmount} USDC`,
    `💰 Max Bet: ${maxAmount} USDC`,
    `⏰ Betting Window: ${bettingWindowText}`,
    "",
    "✏️ Use buttons below to edit parameters or confirm.",
    "Then create on-chain via WebApp!",
  ].join("\n")
}

export function betOpenMessage(
  asset: string,
  contractAddress: string,
  deadline: string,
  totalUp: string,
  totalDown: string,
  upCount: number,
  downCount: number
): string {
  const total = (parseFloat(totalUp) + parseFloat(totalDown)).toFixed(2)
  return [
    `🎲 *Bet Open!*`,
    "",
    `� ${asset}`,
    `⏰ Betting closes: ${deadline}`,
    `� Contract: \`${contractAddress.slice(0, 6)}...${contractAddress.slice(-4)}\``,
    "",
    `� UP (${upCount}): ${totalUp} USDC`,
    `📉 DOWN (${downCount}): ${totalDown} USDC`,
    `💰 Total pool: ${total} USDC`,
  ].join("\n")
}

export function betLockedMessage(
  asset: string,
  startPrice: string,
  endTimeStr: string,
  totalUp: string,
  totalDown: string
): string {
  const total = (parseFloat(totalUp) + parseFloat(totalDown)).toFixed(2)
  return [
    "🔒 *Bet Locked!*",
    "",
    `📊 ${asset}`,
    `💹 Start price: $${startPrice}`,
    `⏰ Settlement: ${endTimeStr}`,
    "",
    `📈 UP: ${totalUp} USDC | 📉 DOWN: ${totalDown} USDC`,
    `💰 Total pool: ${total} USDC`,
    "",
    "Waiting for admin-driven settlement...",
  ].join("\n")
}

export function betSettledMessage(
  asset: string,
  startPrice: string,
  endPrice: string,
  winningSide: string,
  isDraw: boolean,
  totalPool: string,
  isNoContest = false
): string {
  if (isNoContest) {
    return [
      "↩️ *Bet Settled — Refund Only*",
      "",
      `📊 ${asset}: $${startPrice} → $${endPrice}`,
      `💰 Pool: ${totalPool} USDC`,
      "",
      "Only one side had bets. All players can claim a full refund. No fees charged.",
    ].join("\n")
  }

  if (isDraw) {
    return [
      "🤝 *Price Unchanged — Draw!*",
      "",
      `📊 ${asset}: $${startPrice} → $${endPrice}`,
      `💰 Pool: ${totalPool} USDC`,
      "",
      "All players can claim a full refund. No fees charged.",
    ].join("\n")
  }

  const sideEmoji = winningSide === "UP" ? "📈" : "📉"
  const result = parseFloat(endPrice) > parseFloat(startPrice) ? "Up" : "Down"

  return [
    "🏆 *Bet Settled!*",
    "",
    `📊 ${asset}: $${startPrice} → $${endPrice} (${result})`,
    `${sideEmoji} *${winningSide} team wins!*`,
    `💰 Pool: ${totalPool} USDC (2.5% fee deducted)`,
    "",
    "Winners: tap below to claim your payout!",
  ].join("\n")
}

export function parseConfirmMessage(intent: ParsedBetIntent): string {
  const lines = ["🤖 *I understood you want to:*", ""]

  if (intent.asset) lines.push(`📊 Asset: ${intent.asset}`)
  if (intent.durationText) lines.push(`⏱ Duration: ${intent.durationText}`)

  if (intent.error) {
    lines.push("")
    lines.push(`⚠️ ${intent.error}`)
  }

  return lines.join("\n")
}

export function noBetsMessage(): string {
  return "📭 You have no active bets."
}
