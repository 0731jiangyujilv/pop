/*
  Warnings:

  - The primary key for the `oracle_registry` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[chainId,betId]` on the table `bets` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[chainId,contractAddress]` on the table `bets` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[chainId,oracleAddress]` on the table `oracle_registry` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PROPOSED', 'OPEN', 'LOCKED', 'SETTLED', 'CANCELLED');

-- DropIndex
DROP INDEX "bets_betId_key";

-- DropIndex
DROP INDEX "oracle_registry_oracleAddress_key";

-- AlterTable
ALTER TABLE "bets" ADD COLUMN     "chainId" INTEGER NOT NULL DEFAULT 84532;

-- AlterTable
ALTER TABLE "contract_verifications" ADD COLUMN     "chainId" INTEGER NOT NULL DEFAULT 84532;

-- AlterTable
ALTER TABLE "oracle_registry" DROP CONSTRAINT "oracle_registry_pkey",
ADD COLUMN     "chainId" INTEGER NOT NULL DEFAULT 84532,
ADD CONSTRAINT "oracle_registry_pkey" PRIMARY KEY ("chainId", "asset");

-- AlterTable
ALTER TABLE "positions" ADD COLUMN     "chainId" INTEGER NOT NULL DEFAULT 84532;

-- CreateTable
CREATE TABLE "x_users" (
    "id" SERIAL NOT NULL,
    "xUserId" VARCHAR(64) NOT NULL,
    "username" VARCHAR(255),
    "walletAddress" VARCHAR(42),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "x_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "x_proposals" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL DEFAULT 84532,
    "tweetId" VARCHAR(64) NOT NULL,
    "conversationId" VARCHAR(64),
    "creatorXUserId" VARCHAR(64) NOT NULL,
    "creatorUsername" VARCHAR(255),
    "creatorWallet" VARCHAR(42),
    "asset" VARCHAR(20) NOT NULL,
    "minAmount" DECIMAL(65,30) NOT NULL,
    "maxAmount" DECIMAL(65,30) NOT NULL,
    "duration" INTEGER NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "proposalReplyTweetId" VARCHAR(64),
    "announcementTweetId" VARCHAR(64),
    "settlementTweetId" VARCHAR(64),
    "contractAddress" VARCHAR(42),
    "onChainBetId" INTEGER,
    "txHash" VARCHAR(66),
    "bettingDeadline" TIMESTAMP(3),
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "startPrice" VARCHAR(40),
    "endPrice" VARCHAR(40),
    "winningSide" VARCHAR(8),
    "isDraw" BOOLEAN NOT NULL DEFAULT false,
    "totalUp" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalDown" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "x_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "x_cursors" (
    "key" VARCHAR(100) NOT NULL,
    "value" VARCHAR(255) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "x_cursors_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "siwe_nonces" (
    "nonce" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "siwe_nonces_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "chainId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "x_users_xUserId_key" ON "x_users"("xUserId");

-- CreateIndex
CREATE UNIQUE INDEX "x_users_walletAddress_key" ON "x_users"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "x_proposals_uuid_key" ON "x_proposals"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "x_proposals_tweetId_key" ON "x_proposals"("tweetId");

-- CreateIndex
CREATE INDEX "x_proposals_status_idx" ON "x_proposals"("status");

-- CreateIndex
CREATE INDEX "x_proposals_chainId_status_idx" ON "x_proposals"("chainId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "x_proposals_chainId_contractAddress_key" ON "x_proposals"("chainId", "contractAddress");

-- CreateIndex
CREATE UNIQUE INDEX "x_proposals_chainId_onChainBetId_key" ON "x_proposals"("chainId", "onChainBetId");

-- CreateIndex
CREATE INDEX "sessions_address_chainId_idx" ON "sessions"("address", "chainId");

-- CreateIndex
CREATE INDEX "bets_chainId_status_idx" ON "bets"("chainId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bets_chainId_betId_key" ON "bets"("chainId", "betId");

-- CreateIndex
CREATE UNIQUE INDEX "bets_chainId_contractAddress_key" ON "bets"("chainId", "contractAddress");

-- CreateIndex
CREATE INDEX "contract_verifications_chainId_idx" ON "contract_verifications"("chainId");

-- CreateIndex
CREATE UNIQUE INDEX "oracle_registry_chainId_oracleAddress_key" ON "oracle_registry"("chainId", "oracleAddress");

-- CreateIndex
CREATE INDEX "positions_chainId_idx" ON "positions"("chainId");

-- AddForeignKey
ALTER TABLE "x_proposals" ADD CONSTRAINT "x_proposals_creatorXUserId_fkey" FOREIGN KEY ("creatorXUserId") REFERENCES "x_users"("xUserId") ON DELETE RESTRICT ON UPDATE CASCADE;
