-- CreateEnum
CREATE TYPE "VerificationKind" AS ENUM ('BET', 'PRICE_ORACLE');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFYING', 'VERIFIED', 'FAILED');

-- CreateTable
CREATE TABLE "contract_verifications" (
    "contractAddress" VARCHAR(42) NOT NULL,
    "kind" "VerificationKind" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifyAttempts" INTEGER NOT NULL DEFAULT 0,
    "txHash" VARCHAR(66),
    "lastError" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_verifications_pkey" PRIMARY KEY ("contractAddress")
);

-- CreateIndex
CREATE INDEX "contract_verifications_status_kind_idx" ON "contract_verifications"("status", "kind");
