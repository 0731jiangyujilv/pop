-- CreateEnum
CREATE TYPE "BetStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'CREATED', 'DEPOSITING', 'LOCKED', 'SETTLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "tgId" BIGINT NOT NULL,
    "walletAddress" VARCHAR(42),
    "username" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("tgId")
);

-- CreateTable
CREATE TABLE "bets" (
    "id" SERIAL NOT NULL,
    "betId" INTEGER,
    "contractAddress" VARCHAR(42),
    "p1TgId" BIGINT NOT NULL,
    "p2TgId" BIGINT,
    "p1Address" VARCHAR(42),
    "p2Address" VARCHAR(42),
    "asset" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "duration" INTEGER NOT NULL,
    "direction" VARCHAR(4) NOT NULL DEFAULT 'UP',
    "p1Deposited" BOOLEAN NOT NULL DEFAULT false,
    "p2Deposited" BOOLEAN NOT NULL DEFAULT false,
    "status" "BetStatus" NOT NULL DEFAULT 'PROPOSED',
    "messageId" BIGINT,
    "chatId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "winnerTgId" BIGINT,
    "startPrice" VARCHAR(40),
    "endPrice" VARCHAR(40),
    "txHash" VARCHAR(66),

    CONSTRAINT "bets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bets_betId_key" ON "bets"("betId");

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_p1TgId_fkey" FOREIGN KEY ("p1TgId") REFERENCES "users"("tgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_p2TgId_fkey" FOREIGN KEY ("p2TgId") REFERENCES "users"("tgId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_winnerTgId_fkey" FOREIGN KEY ("winnerTgId") REFERENCES "users"("tgId") ON DELETE SET NULL ON UPDATE CASCADE;
