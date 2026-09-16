import { prisma } from "./common/db"
import { startEventMarketStatsWorker } from "./common/services/event-market-stats"

async function main() {
  await startEventMarketStatsWorker()

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down event-market stats worker...`)
    await prisma.$disconnect()
    process.exit(0)
  }

  process.once("SIGINT", () => shutdown("SIGINT"))
  process.once("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch(async (error) => {
  console.error("Event-market stats worker fatal error:", error)
  await prisma.$disconnect()
  process.exit(1)
})
