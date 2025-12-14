-- CreateTable
CREATE TABLE "BtcLockedSnapshot" (
    "id" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "blockHash" TEXT,
    "btcLocked" DOUBLE PRECISION NOT NULL,
    "satoshis" BIGINT NOT NULL,
    "utxoCount" INTEGER NOT NULL,
    "blockTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BtcLockedSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrbtcSupplySnapshot" (
    "id" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "blockHash" TEXT,
    "frbtcIssued" DOUBLE PRECISION NOT NULL,
    "rawSupply" TEXT NOT NULL,
    "adjustedSupply" TEXT NOT NULL,
    "blockTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FrbtcSupplySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WrapTransaction" (
    "id" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "blockHash" TEXT,
    "amount" TEXT NOT NULL,
    "senderAddress" TEXT NOT NULL DEFAULT '',
    "recipientAddress" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WrapTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnwrapTransaction" (
    "id" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "blockHash" TEXT,
    "amount" TEXT NOT NULL,
    "senderAddress" TEXT,
    "recipientAddress" TEXT NOT NULL DEFAULT '',
    "timestamp" TIMESTAMP(3) NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnwrapTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncState" (
    "dataType" TEXT NOT NULL,
    "lastBlockHeight" INTEGER NOT NULL DEFAULT 0,
    "lastTxid" TEXT,
    "totalWrapped" TEXT NOT NULL DEFAULT '0',
    "totalUnwrapped" TEXT NOT NULL DEFAULT '0',
    "wrapCount" INTEGER NOT NULL DEFAULT 0,
    "unwrapCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("dataType")
);

-- CreateTable
CREATE TABLE "DailyMetrics" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "btcLockedOpen" BIGINT NOT NULL,
    "btcLockedHigh" BIGINT NOT NULL,
    "btcLockedLow" BIGINT NOT NULL,
    "btcLockedClose" BIGINT NOT NULL,
    "frbtcSupplyOpen" BIGINT NOT NULL,
    "frbtcSupplyHigh" BIGINT NOT NULL,
    "frbtcSupplyLow" BIGINT NOT NULL,
    "frbtcSupplyClose" BIGINT NOT NULL,
    "wrapCount" INTEGER NOT NULL DEFAULT 0,
    "unwrapCount" INTEGER NOT NULL DEFAULT 0,
    "wrapVolume" BIGINT NOT NULL DEFAULT 0,
    "unwrapVolume" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCache" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiCache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "BtcLockedSnapshot_blockHeight_idx" ON "BtcLockedSnapshot"("blockHeight");

-- CreateIndex
CREATE INDEX "BtcLockedSnapshot_createdAt_idx" ON "BtcLockedSnapshot"("createdAt");

-- CreateIndex
CREATE INDEX "FrbtcSupplySnapshot_blockHeight_idx" ON "FrbtcSupplySnapshot"("blockHeight");

-- CreateIndex
CREATE INDEX "FrbtcSupplySnapshot_createdAt_idx" ON "FrbtcSupplySnapshot"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WrapTransaction_txid_key" ON "WrapTransaction"("txid");

-- CreateIndex
CREATE INDEX "WrapTransaction_blockHeight_idx" ON "WrapTransaction"("blockHeight");

-- CreateIndex
CREATE INDEX "WrapTransaction_senderAddress_idx" ON "WrapTransaction"("senderAddress");

-- CreateIndex
CREATE INDEX "WrapTransaction_confirmed_idx" ON "WrapTransaction"("confirmed");

-- CreateIndex
CREATE UNIQUE INDEX "UnwrapTransaction_txid_key" ON "UnwrapTransaction"("txid");

-- CreateIndex
CREATE INDEX "UnwrapTransaction_blockHeight_idx" ON "UnwrapTransaction"("blockHeight");

-- CreateIndex
CREATE INDEX "UnwrapTransaction_recipientAddress_idx" ON "UnwrapTransaction"("recipientAddress");

-- CreateIndex
CREATE INDEX "UnwrapTransaction_confirmed_idx" ON "UnwrapTransaction"("confirmed");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMetrics_date_key" ON "DailyMetrics"("date");

-- CreateIndex
CREATE INDEX "DailyMetrics_date_idx" ON "DailyMetrics"("date");

-- CreateIndex
CREATE INDEX "ApiCache_expiresAt_idx" ON "ApiCache"("expiresAt");
