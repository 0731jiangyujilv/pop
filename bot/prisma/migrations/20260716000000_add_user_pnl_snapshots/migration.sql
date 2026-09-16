-- Daily net-P&L snapshot per wallet (one row per address + UTC day).
-- Written once a day by the user-pnl snapshotter; read by the portfolio page's
-- profit curve. Forward-only; read-only aggregation, never touches funds.

CREATE TABLE "user_pnl_daily_snapshots" (
  "address" VARCHAR(42) NOT NULL,
  "date" DATE NOT NULL,
  "pnl" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "positionValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "netInvested" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "user_pnl_daily_snapshots_pkey" PRIMARY KEY ("address", "date")
);

CREATE INDEX "user_pnl_daily_snapshots_address_date_idx" ON "user_pnl_daily_snapshots"("address", "date");
