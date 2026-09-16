import { prisma } from "./common/db"
import { startVerifyCron } from "./common/services/verify"

async function main() {
  startVerifyCron()

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down verify worker...`)
    await prisma.$disconnect()
    process.exit(0)
  }

  process.once("SIGINT", () => shutdown("SIGINT"))
  process.once("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch(async (error) => {
  console.error("Verify worker fatal error:", error)
  await prisma.$disconnect()
  process.exit(1)
})
