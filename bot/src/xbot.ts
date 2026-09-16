import { config } from "./common/config"
import { prisma } from "./common/db"
import { pollMentions } from "./x/mentions"

async function main() {
  if (!config.BOT_X_USERNAME || !config.X_API_BOT_USER_ID) {
    throw new Error("X bot configuration is incomplete")
  }



  setInterval((ccx) => {
    pollMentions().catch((error) => {
      console.error("[xbot] mention poll failed:", error)
    })
  }, config.POLL_INTERVAL_MS)

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down xbot...`)
    await prisma.$disconnect()
    process.exit(0)
  }

  process.once("SIGINT", () => shutdown("SIGINT"))
  process.once("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch(async (error) => {
  console.error("[xbot] fatal error:", error)
  await prisma.$disconnect()
  process.exit(1)
})
