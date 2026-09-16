-- AlterTable: extend swarm_consensus with the contract address that drove this resolve
ALTER TABLE "swarm_consensus"
  ADD COLUMN "contractAddress" VARCHAR(64);

CREATE INDEX "swarm_consensus_contractAddress_idx" ON "swarm_consensus"("contractAddress");

-- CreateTable: per-evidence-item rows captured from the oracle swarm at resolve time
CREATE TABLE "swarm_evidence" (
  "id" SERIAL PRIMARY KEY,
  "consensusId" INTEGER NOT NULL,
  "oracleId" VARCHAR(80) NOT NULL,
  "externalId" VARCHAR(120) NOT NULL,
  "text" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "author" VARCHAR(120),
  "source" VARCHAR(40) NOT NULL,
  "timestamp" VARCHAR(40) NOT NULL,
  "txHash" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "swarm_evidence_consensusId_fkey"
    FOREIGN KEY ("consensusId") REFERENCES "swarm_consensus"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "swarm_evidence_consensusId_oracleId_idx"
  ON "swarm_evidence"("consensusId", "oracleId");
