-- AlterTable
ALTER TABLE "swarm_nanopays"
  ADD COLUMN "batchId" VARCHAR(64),
  ADD COLUMN "transferId" VARCHAR(80),
  ADD COLUMN "status" VARCHAR(16),
  ADD COLUMN "settlementTxHash" VARCHAR(80),
  ADD COLUMN "payer" VARCHAR(64),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Drop the default after backfill so future inserts must set it explicitly (Prisma @updatedAt)
ALTER TABLE "swarm_nanopays" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "swarm_nanopays_batchId_idx" ON "swarm_nanopays"("batchId");

-- CreateIndex
CREATE INDEX "swarm_nanopays_status_transferId_idx" ON "swarm_nanopays"("status", "transferId");
