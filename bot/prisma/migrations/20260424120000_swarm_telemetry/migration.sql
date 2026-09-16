-- CreateTable
CREATE TABLE "swarm_nanopays" (
    "id" VARCHAR(80) NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "oracleId" VARCHAR(80) NOT NULL,
    "oracleEmoji" VARCHAR(8) NOT NULL,
    "oracleName" VARCHAR(80) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "amountUsdc" DECIMAL(65,30) NOT NULL,
    "txHash" VARCHAR(80) NOT NULL,
    "verdict" VARCHAR(4),
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swarm_nanopays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "swarm_nanopays_ts_idx" ON "swarm_nanopays"("ts" DESC);

-- CreateTable
CREATE TABLE "swarm_consensus" (
    "id" SERIAL NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "chainId" INTEGER,
    "betId" INTEGER,
    "question" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "outcome" VARCHAR(4) NOT NULL,
    "spread" DOUBLE PRECISION NOT NULL,
    "yesWeight" DOUBLE PRECISION NOT NULL,
    "noWeight" DOUBLE PRECISION NOT NULL,
    "totalNanopayments" INTEGER NOT NULL,
    "totalSpentUsdc" DECIMAL(65,30) NOT NULL,
    "resolutionTxHash" VARCHAR(80),
    "perOracle" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swarm_consensus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "swarm_consensus_ts_idx" ON "swarm_consensus"("ts" DESC);
