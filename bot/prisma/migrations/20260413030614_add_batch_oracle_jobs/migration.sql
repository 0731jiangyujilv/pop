-- CreateEnum
CREATE TYPE "BatchOracleStep" AS ENUM ('PENDING', 'ORACLE_CREATED', 'REPORTER_SET', 'FEED_SET', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "batch_oracle_jobs" (
    "chainId" INTEGER NOT NULL,
    "asset" VARCHAR(50) NOT NULL,
    "step" "BatchOracleStep" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batch_oracle_jobs_pkey" PRIMARY KEY ("chainId","asset")
);

-- CreateIndex
CREATE INDEX "batch_oracle_jobs_chainId_step_idx" ON "batch_oracle_jobs"("chainId", "step");
