import { prisma } from "./common/db"
import { startChampionPoolProbabilityWorker } from "./common/services/champion-pool-probability"

async function main() {
  await startChampionPoolProbabilityWorker()

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down champion pool probability worker...`)
    await prisma.$disconnect()
    process.exit(0)
  }

  process.once("SIGINT", () => shutdown("SIGINT"))
  process.once("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch(async (error) => {
  console.error("Champion pool probability worker fatal error:", error)
  await prisma.$disconnect()
  process.exit(1)
})
