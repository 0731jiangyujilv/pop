-- CreateEnum
CREATE TYPE "ProposalType" AS ENUM ('PRICE_BET', 'EVENT_BET');

-- AlterEnum
ALTER TYPE "VerificationKind" ADD VALUE 'EVENT_BET';

-- AlterTable
ALTER TABLE "x_proposals" ADD COLUMN     "dataSourceConfig" TEXT,
ADD COLUMN     "dataSourceType" VARCHAR(20),
ADD COLUMN     "outcome" VARCHAR(10),
ADD COLUMN     "question" TEXT,
ADD COLUMN     "totalNo" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "totalYes" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "type" "ProposalType" NOT NULL DEFAULT 'PRICE_BET';

-- CreateTable
CREATE TABLE "event_market_stats" (
    "chainId" INTEGER NOT NULL,
    "contractAddress" VARCHAR(42) NOT NULL,
    "question" TEXT,
    "resolutionSource" TEXT,
    "status" INTEGER NOT NULL DEFAULT 0,
    "yesWins" BOOLEAN NOT NULL DEFAULT false,
    "isDraw" BOOLEAN NOT NULL DEFAULT false,
    "bettingDeadline" TIMESTAMP(3),
    "resolveAfter" TIMESTAMP(3),
    "yesReserve" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "noReserve" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalCollateral" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalLpShares" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "yesProbability" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "buyYesCount" INTEGER NOT NULL DEFAULT 0,
    "buyNoCount" INTEGER NOT NULL DEFAULT 0,
    "sellYesCount" INTEGER NOT NULL DEFAULT 0,
    "sellNoCount" INTEGER NOT NULL DEFAULT 0,
    "buyYesVolume" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "buyNoVolume" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sellYesVolume" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sellNoVolume" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalVolume" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "tradeCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueTraders" INTEGER NOT NULL DEFAULT 0,
    "liquidityAddedCount" INTEGER NOT NULL DEFAULT 0,
    "liquidityRemovedCount" INTEGER NOT NULL DEFAULT 0,
    "totalLiquidityAdded" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalLiquidityRemoved" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "uniqueLps" INTEGER NOT NULL DEFAULT 0,
    "pairRedeemCount" INTEGER NOT NULL DEFAULT 0,
    "pairRedeemVolume" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "redeemCount" INTEGER NOT NULL DEFAULT 0,
    "redeemPayout" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lpClaimCount" INTEGER NOT NULL DEFAULT 0,
    "lpClaimPayout" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "platformFee" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "creatorFee" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lastScannedBlock" BIGINT NOT NULL DEFAULT 0,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_market_stats_pkey" PRIMARY KEY ("chainId","contractAddress")
);

-- CreateTable
CREATE TABLE "event_market_participants" (
    "chainId" INTEGER NOT NULL,
    "contractAddress" VARCHAR(42) NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "isTrader" BOOLEAN NOT NULL DEFAULT false,
    "isLp" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "event_market_participants_pkey" PRIMARY KEY ("chainId","contractAddress","address")
);

-- CreateTable
CREATE TABLE "event_market_daily_snapshots" (
    "chainId" INTEGER NOT NULL,
    "contractAddress" VARCHAR(42) NOT NULL,
    "date" DATE NOT NULL,
    "totalVolume" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "tradeCount" INTEGER NOT NULL DEFAULT 0,
    "totalCollateral" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "uniqueTraders" INTEGER NOT NULL DEFAULT 0,
    "uniqueLps" INTEGER NOT NULL DEFAULT 0,
    "buyYesVolume" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "buyNoVolume" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sellYesVolume" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sellNoVolume" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "platformFee" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "creatorFee" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "event_market_daily_snapshots_pkey" PRIMARY KEY ("chainId","contractAddress","date")
);

-- CreateTable
CREATE TABLE "market_probability_points" (
    "id" BIGSERIAL NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" VARCHAR(42) NOT NULL,
    "yesProbability" DOUBLE PRECISION NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_probability_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_market_stats_chainId_idx" ON "event_market_stats"("chainId");

-- CreateIndex
CREATE INDEX "event_market_participants_chainId_contractAddress_idx" ON "event_market_participants"("chainId", "contractAddress");

-- CreateIndex
CREATE INDEX "event_market_daily_snapshots_chainId_idx" ON "event_market_daily_snapshots"("chainId");

-- CreateIndex
CREATE INDEX "event_market_daily_snapshots_date_idx" ON "event_market_daily_snapshots"("date");

-- CreateIndex
CREATE INDEX "market_probability_points_chainId_contractAddress_capturedA_idx" ON "market_probability_points"("chainId", "contractAddress", "capturedAt");

-- CreateIndex
CREATE INDEX "x_proposals_type_status_idx" ON "x_proposals"("type", "status");
