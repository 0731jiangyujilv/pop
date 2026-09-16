import { prisma } from "./common/db"
import { startSettlementCron } from "./common/services/settlement"

async function main() {
  console.log(`⚖️ settlement-worker booting pid=${process.pid} startedAt=${new Date().toISOString()}`)
  startSettlementCron()

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down settlement worker...`)
    await prisma.$disconnect()
    process.exit(0)
  }

  process.once("SIGINT", () => shutdown("SIGINT"))
  process.once("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch(async (error) => {
  console.error("Settlement worker fatal error:", error)
  await prisma.$disconnect()
  process.exit(1)
})
