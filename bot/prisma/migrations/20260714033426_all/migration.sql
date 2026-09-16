-- CreateTable
CREATE TABLE "pool_probability_points" (
    "id" BIGSERIAL NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" VARCHAR(42) NOT NULL,
    "yesProbability" DOUBLE PRECISION NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pool_probability_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pool_probability_points_chainId_contractAddress_capturedAt_idx" ON "pool_probability_points"("chainId", "contractAddress", "capturedAt");
