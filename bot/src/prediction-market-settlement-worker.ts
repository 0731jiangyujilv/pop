import { prisma } from "./common/db"
import { startPredictionMarketSettlementCron } from "./common/services/prediction-market-settlement"

async function main() {
  console.log(
    `🪙 prediction-market-settlement-worker booting pid=${process.pid} startedAt=${new Date().toISOString()}`,
  )
  startPredictionMarketSettlementCron()

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down prediction-market settlement worker...`)
    await prisma.$disconnect()
    process.exit(0)
  }

  process.once("SIGINT", () => shutdown("SIGINT"))
  process.once("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch(async (error) => {
  console.error("Prediction-market settlement worker fatal error:", error)
  await prisma.$disconnect()
  process.exit(1)
})
