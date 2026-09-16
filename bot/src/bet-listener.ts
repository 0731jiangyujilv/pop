import { prisma } from "./common/db"
import { startBetListener } from "./common/services/bet-listener"

async function main() {
  await startBetListener()

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down bet listener...`)
    await prisma.$disconnect()
    process.exit(0)
  }

  process.once("SIGINT", () => shutdown("SIGINT"))
  process.once("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch(async (error) => {
  console.error("Bet listener fatal error:", error)
  await prisma.$disconnect()
  process.exit(1)
})
