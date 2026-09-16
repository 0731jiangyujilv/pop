const path = require("node:path")

const logsDir = path.join(__dirname, "logs")

function app(name, script) {
  return {
    name,
    script,
    cwd: __dirname,
    out_file: path.join(logsDir, `${name}.out.log`),
    error_file: path.join(logsDir, `${name}.error.log`),
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    env: {
      NODE_ENV: "production",
    },
  }
}

module.exports = {
  apps: [
    app("betsys-service", "dist/service.js"),
    app("betsys-tgbot", "dist/tgbot.js"),
    app("betsys-xbot", "dist/xbot.js"),
    // app("betsys-bet-listener", "dist/bet-listener.js"),
    // app("betsys-oracle-listener", "dist/oracle-listener.js"),
    // app("betsys-settlement-worker", "dist/settlement-worker.js"),
    // app("betsys-claim-worker", "dist/claim-worker.js"),
    // app("betsys-verify-worker", "dist/verify-worker.js"),
    // app("betsys-event-settlement", "dist/event-settlement-worker.js"),
    // app("betsys-prediction-settlement", "dist/prediction-market-settlement-worker.js"),
    app("betsys-bet-status-reconciler", "dist/bet-status-reconciler.js"),
    // app("betsys-champion-probability", "dist/champion-probability-worker.js"),
    // app("betsys-champion-pool-probability", "dist/champion-pool-probability-worker.js"),
    // app("betsys-user-pnl", "dist/user-pnl-worker.js"),
    {
      // Compiled from scripts/fund-and-random-all-event-markets.ts by
      // `npm run build` (via tsconfig.scripts.json). CSV path is argv[2].
      ...app("betsys-fund-and-random", "dist/scripts/fund-and-random-all-event-markets.js"),
      args: "/data/polypop/wallets.csv",
    },
    {
      // One-shot script: it syncs every market then exits. Without
      // autorestart:false pm2 would relaunch it immediately on exit, turning it
      // into a nonstop polling loop.
      //
      // Every 2 hours: one eth_call per market. The interval sets three things at
      // once — the resolution of the /fed, /crypto and /midterm odds charts, the
      // accuracy of UTC-day attribution in the daily snapshots, and how stale the
      // stats page can be. Offset a couple of minutes after the hour so we're
      // not hitting the RPC provider at the same instant as everyone else's job.
      ...app("scan-all-event-markets", "dist/scripts/scan-all-event-markets.js"),
      autorestart: false,
      cron_restart: "2 */2 * * *",
    },
  ],
}

// Keep only 2 days of logs with pm2-logrotate:
// pm2 install pm2-logrotate
// pm2 set pm2-logrotate:retain 2
// pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
// pm2 set pm2-logrotate:dateFormat 'YYYY-MM-DD_HH-mm-ss'
