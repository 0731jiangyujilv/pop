import { prisma } from "./common/db"
import { startOracleListener } from "./common/services/oracle-listener"

async function main() {
  await startOracleListener()

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down oracle listener...`)
    await prisma.$disconnect()
    process.exit(0)
  }

  process.once("SIGINT", () => shutdown("SIGINT"))
  process.once("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch(async (error) => {
  console.error("Oracle listener fatal error:", error)
  await prisma.$disconnect()
  process.exit(1)
})
