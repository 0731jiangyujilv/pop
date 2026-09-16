import { prisma } from "./common/db"
import { startBetStatusReconciler } from "./common/services/bet-status-reconciler"

async function main() {
  console.log(`🔁 bet-status-reconciler booting pid=${process.pid} startedAt=${new Date().toISOString()}`)
  await startBetStatusReconciler()

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down bet-status-reconciler...`)
    await prisma.$disconnect()
    process.exit(0)
  }

  process.once("SIGINT", () => shutdown("SIGINT"))
  process.once("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch(async (error) => {
  console.error("Bet status reconciler fatal error:", error)
  await prisma.$disconnect()
  process.exit(1)
})
