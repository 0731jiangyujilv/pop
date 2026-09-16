import { config } from "./common/config"
import { prisma } from "./common/db"
import { bot } from "./tg/bot"

async function main() {
  if (!config.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is required to run tgbot")
  }

  await bot.launch()
  console.log("✅ Telegram bot started")

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down tgbot...`)
    bot.stop(signal)
    await prisma.$disconnect()
    process.exit(0)
  }

  process.once("SIGINT", () => shutdown("SIGINT"))
  process.once("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch(async (err) => {
  console.error("Telegram bot fatal error:", err)
  await prisma.$disconnect()
  process.exit(1)
})
