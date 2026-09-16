import { prisma } from "./common/db"
import { startEventSettlementCron } from "./common/services/event-settlement"

async function main() {
  console.log(`🔮 event-settlement-worker booting pid=${process.pid} startedAt=${new Date().toISOString()}`)
  startEventSettlementCron()

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down event settlement worker...`)
    await prisma.$disconnect()
    process.exit(0)
  }

  process.once("SIGINT", () => shutdown("SIGINT"))
  process.once("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch(async (error) => {
  console.error("Event settlement worker fatal error:", error)
  await prisma.$disconnect()
  process.exit(1)
})
