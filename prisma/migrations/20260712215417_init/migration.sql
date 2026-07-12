-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairOrder" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT NOT NULL,
    "cccRoNumber" TEXT NOT NULL,
    "vehicleYear" INTEGER NOT NULL,
    "vehicleMake" TEXT NOT NULL,
    "vehicleModel" TEXT NOT NULL,
    "vehicleRaw" TEXT NOT NULL,

    CONSTRAINT "RepairOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartLine" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "repairOrderId" TEXT NOT NULL,
    "cccLineNumber" INTEGER NOT NULL,
    "partTypeRaw" TEXT NOT NULL,
    "partDescriptionRaw" TEXT NOT NULL,
    "partNumberRaw" TEXT,
    "partDescription" TEXT NOT NULL,
    "partNumber" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PartLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalPurchase" (
    "id" TEXT NOT NULL,
    "partLineId" TEXT NOT NULL,
    "vendorName" TEXT,
    "discountPercent" DECIMAL(5,4),
    "orderedDate" TIMESTAMP(3),
    "expectedDelivery" TIMESTAMP(3),
    "invoiceDate" TIMESTAMP(3),
    "creditDate" TIMESTAMP(3),
    "extendedSales" DECIMAL(10,2),
    "actualCost" DECIMAL(10,2),
    "remarks" TEXT,

    CONSTRAINT "HistoricalPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchSearch" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partLineId" TEXT NOT NULL,
    "queryVehicleYear" INTEGER NOT NULL,
    "queryVehicleMake" TEXT NOT NULL,
    "queryVehicleModel" TEXT NOT NULL,
    "queryPartDescription" TEXT NOT NULL,
    "queryPartNumber" TEXT,
    "matcherLabel" INTEGER,
    "labelSource" TEXT,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "rawResponse" JSONB NOT NULL,

    CONSTRAINT "MatchSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "matchSearchId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "ebayItemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "itemUrl" TEXT NOT NULL,
    "imageUrl" TEXT,
    "condition" TEXT,
    "candidateLabel" INTEGER,
    "labelSource" TEXT,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "partLineId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "ebayItemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'placed',

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_name_key" ON "Shop"("name");

-- CreateIndex
CREATE INDEX "RepairOrder_createdAt_idx" ON "RepairOrder"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RepairOrder_shopId_cccRoNumber_key" ON "RepairOrder"("shopId", "cccRoNumber");

-- CreateIndex
CREATE INDEX "PartLine_repairOrderId_idx" ON "PartLine"("repairOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PartLine_repairOrderId_cccLineNumber_key" ON "PartLine"("repairOrderId", "cccLineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalPurchase_partLineId_key" ON "HistoricalPurchase"("partLineId");

-- CreateIndex
CREATE INDEX "MatchSearch_partLineId_createdAt_idx" ON "MatchSearch"("partLineId", "createdAt");

-- CreateIndex
CREATE INDEX "Candidate_matchSearchId_rank_idx" ON "Candidate"("matchSearchId", "rank");

-- CreateIndex
CREATE INDEX "Candidate_ebayItemId_idx" ON "Candidate"("ebayItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_candidateId_key" ON "PurchaseOrder"("candidateId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_partLineId_idx" ON "PurchaseOrder"("partLineId");

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartLine" ADD CONSTRAINT "PartLine_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalPurchase" ADD CONSTRAINT "HistoricalPurchase_partLineId_fkey" FOREIGN KEY ("partLineId") REFERENCES "PartLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSearch" ADD CONSTRAINT "MatchSearch_partLineId_fkey" FOREIGN KEY ("partLineId") REFERENCES "PartLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_matchSearchId_fkey" FOREIGN KEY ("matchSearchId") REFERENCES "MatchSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_partLineId_fkey" FOREIGN KEY ("partLineId") REFERENCES "PartLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
