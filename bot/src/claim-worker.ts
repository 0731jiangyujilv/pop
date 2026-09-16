import { prisma } from "./common/db"
import { startClaimCron } from "./common/services/claim"

async function main() {
  console.log(`💸 claim-worker booting pid=${process.pid} startedAt=${new Date().toISOString()}`)
  startClaimCron()

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down claim worker...`)
    await prisma.$disconnect()
    process.exit(0)
  }

  process.once("SIGINT", () => shutdown("SIGINT"))
  process.once("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch(async (error) => {
  console.error("Claim worker fatal error:", error)
  await prisma.$disconnect()
  process.exit(1)
})
