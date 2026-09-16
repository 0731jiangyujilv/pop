import { prisma } from "./common/db"
import { startChampionProbabilityWorker } from "./common/services/champion-probability"

async function main() {
  await startChampionProbabilityWorker()

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down champion probability worker...`)
    await prisma.$disconnect()
    process.exit(0)
  }

  process.once("SIGINT", () => shutdown("SIGINT"))
  process.once("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch(async (error) => {
  console.error("Champion probability worker fatal error:", error)
  await prisma.$disconnect()
  process.exit(1)
})
