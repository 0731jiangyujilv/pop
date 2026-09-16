import { prisma } from "./common/db"
import { snapshotUserPnl, startUserPnlWorker } from "./common/services/user-pnl"

// One-shot mode: `node dist/user-pnl-worker.js --once` (or USER_PNL_RUN_ONCE=1)
// runs a single snapshot immediately and exits — handy for seeding or driving
// from an external cron. Without it, run as a long-lived pm2 process that
// snapshots on startup and then every USER_PNL_SNAPSHOT_INTERVAL_MS (24h).
const runOnce = process.argv.includes("--once") || process.env.USER_PNL_RUN_ONCE === "1"

async function main() {
  if (runOnce) {
    const summary = await snapshotUserPnl()
    console.log(
      `[user-pnl] snapshot ${summary.date}: ${summary.walletsWritten} wallet(s) across ${summary.marketsScanned} market(s)`,
    )
    await prisma.$disconnect()
    process.exit(0)
  }

  await startUserPnlWorker()

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down user P&L worker...`)
    await prisma.$disconnect()
    process.exit(0)
  }

  process.once("SIGINT", () => shutdown("SIGINT"))
  process.once("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch(async (error) => {
  console.error("User P&L worker fatal error:", error)
  await prisma.$disconnect()
  process.exit(1)
})
