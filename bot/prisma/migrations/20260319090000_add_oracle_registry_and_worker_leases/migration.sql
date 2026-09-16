-- CreateTable
CREATE TABLE "oracle_registry" (
    "asset" VARCHAR(50) NOT NULL,
    "oracleAddress" VARCHAR(42) NOT NULL,
    "decimals" INTEGER NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oracle_registry_pkey" PRIMARY KEY ("asset")
);

-- CreateTable
CREATE TABLE "worker_leases" (
    "key" VARCHAR(100) NOT NULL,
    "owner" VARCHAR(100) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_leases_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "oracle_registry_oracleAddress_key" ON "oracle_registry"("oracleAddress");
