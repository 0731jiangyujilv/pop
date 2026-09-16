/*
  Warnings:

  - The values [ACCEPTED,CREATED,DEPOSITING] on the enum `BetStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `amount` on the `bets` table. All the data in the column will be lost.
  - You are about to drop the column `direction` on the `bets` table. All the data in the column will be lost.
  - You are about to drop the column `p1Address` on the `bets` table. All the data in the column will be lost.
  - You are about to drop the column `p1Deposited` on the `bets` table. All the data in the column will be lost.
  - You are about to drop the column `p1TgId` on the `bets` table. All the data in the column will be lost.
  - You are about to drop the column `p2Address` on the `bets` table. All the data in the column will be lost.
  - You are about to drop the column `p2Deposited` on the `bets` table. All the data in the column will be lost.
  - You are about to drop the column `p2TgId` on the `bets` table. All the data in the column will be lost.
  - You are about to drop the column `winnerTgId` on the `bets` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[uuid]` on the table `bets` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `creatorTgId` to the `bets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `maxAmount` to the `bets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `minAmount` to the `bets` table without a default value. This is not possible if the table is not empty.
  - The required column `uuid` was added to the `bets` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "BetStatus_new" AS ENUM ('PROPOSED', 'OPEN', 'LOCKED', 'SETTLED', 'CANCELLED');
ALTER TABLE "bets" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "bets" ALTER COLUMN "status" TYPE "BetStatus_new" USING ("status"::text::"BetStatus_new");
ALTER TYPE "BetStatus" RENAME TO "BetStatus_old";
ALTER TYPE "BetStatus_new" RENAME TO "BetStatus";
DROP TYPE "BetStatus_old";
ALTER TABLE "bets" ALTER COLUMN "status" SET DEFAULT 'PROPOSED';
COMMIT;

-- DropForeignKey
ALTER TABLE "bets" DROP CONSTRAINT "bets_p1TgId_fkey";

-- DropForeignKey
ALTER TABLE "bets" DROP CONSTRAINT "bets_p2TgId_fkey";

-- DropForeignKey
ALTER TABLE "bets" DROP CONSTRAINT "bets_winnerTgId_fkey";

-- AlterTable
ALTER TABLE "bets" DROP COLUMN "amount",
DROP COLUMN "direction",
DROP COLUMN "p1Address",
DROP COLUMN "p1Deposited",
DROP COLUMN "p1TgId",
DROP COLUMN "p2Address",
DROP COLUMN "p2Deposited",
DROP COLUMN "p2TgId",
DROP COLUMN "winnerTgId",
ADD COLUMN     "bettingDeadline" TIMESTAMP(3),
ADD COLUMN     "creatorTgId" BIGINT NOT NULL,
ADD COLUMN     "isDraw" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxAmount" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "minAmount" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "totalDown" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "totalUp" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "uuid" TEXT NOT NULL,
ADD COLUMN     "winningSide" VARCHAR(4);

-- CreateTable
CREATE TABLE "positions" (
    "id" SERIAL NOT NULL,
    "betId" INTEGER NOT NULL,
    "tgId" BIGINT NOT NULL,
    "side" VARCHAR(4) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "claimed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "positions_betId_tgId_key" ON "positions"("betId", "tgId");

-- CreateIndex
CREATE UNIQUE INDEX "bets_uuid_key" ON "bets"("uuid");

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_creatorTgId_fkey" FOREIGN KEY ("creatorTgId") REFERENCES "users"("tgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_betId_fkey" FOREIGN KEY ("betId") REFERENCES "bets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_tgId_fkey" FOREIGN KEY ("tgId") REFERENCES "users"("tgId") ON DELETE RESTRICT ON UPDATE CASCADE;
