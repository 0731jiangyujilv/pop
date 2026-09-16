-- Referral / invite tracking.
-- Rewards are recorded off-chain as an auditable USDC-denominated ledger.

CREATE TABLE "referral_accounts" (
  "address" VARCHAR(42) NOT NULL,
  "code" VARCHAR(24) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "referral_accounts_pkey" PRIMARY KEY ("address")
);

CREATE TABLE "referral_connections" (
  "referredAddress" VARCHAR(42) NOT NULL,
  "referrerAddress" VARCHAR(42) NOT NULL,
  "referralCode" VARCHAR(24) NOT NULL,
  "source" VARCHAR(64),
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "firstTradeAt" TIMESTAMP(3),

  CONSTRAINT "referral_connections_pkey" PRIMARY KEY ("referredAddress")
);

CREATE TABLE "referral_trades" (
  "id" BIGSERIAL NOT NULL,
  "chainId" INTEGER NOT NULL,
  "marketAddress" VARCHAR(42) NOT NULL,
  "txHash" VARCHAR(66) NOT NULL,
  "traderAddress" VARCHAR(42) NOT NULL,
  "referrerAddress" VARCHAR(42) NOT NULL,
  "side" VARCHAR(3) NOT NULL,
  "action" VARCHAR(4) NOT NULL,
  "volumeUsdc" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "feeBps" INTEGER NOT NULL,
  "feeUsdc" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "rewardRateBps" INTEGER NOT NULL DEFAULT 1000,
  "rewardUsdc" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "blockNumber" BIGINT,
  "tradedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "referral_trades_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referral_accounts_code_key" ON "referral_accounts"("code");
CREATE INDEX "referral_connections_referrerAddress_idx" ON "referral_connections"("referrerAddress");
CREATE UNIQUE INDEX "referral_trades_chainId_marketAddress_txHash_key" ON "referral_trades"("chainId", "marketAddress", "txHash");
CREATE INDEX "referral_trades_referrerAddress_tradedAt_idx" ON "referral_trades"("referrerAddress", "tradedAt");
CREATE INDEX "referral_trades_traderAddress_tradedAt_idx" ON "referral_trades"("traderAddress", "tradedAt");

ALTER TABLE "referral_connections"
  ADD CONSTRAINT "referral_connections_referrerAddress_fkey"
  FOREIGN KEY ("referrerAddress") REFERENCES "referral_accounts"("address")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "referral_connections"
  ADD CONSTRAINT "referral_connections_referredAddress_fkey"
  FOREIGN KEY ("referredAddress") REFERENCES "referral_accounts"("address")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "referral_trades"
  ADD CONSTRAINT "referral_trades_referrerAddress_fkey"
  FOREIGN KEY ("referrerAddress") REFERENCES "referral_accounts"("address")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "referral_trades"
  ADD CONSTRAINT "referral_trades_traderAddress_fkey"
  FOREIGN KEY ("traderAddress") REFERENCES "referral_accounts"("address")
  ON DELETE RESTRICT ON UPDATE CASCADE;
