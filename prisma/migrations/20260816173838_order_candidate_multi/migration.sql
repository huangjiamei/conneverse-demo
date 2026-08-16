-- DropIndex
DROP INDEX "PurchaseOrder_candidateId_key";

-- CreateIndex
CREATE INDEX "PurchaseOrder_candidateId_idx" ON "PurchaseOrder"("candidateId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_orderedByUserId_idx" ON "PurchaseOrder"("orderedByUserId");
