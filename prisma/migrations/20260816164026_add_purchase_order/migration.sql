/*
  Warnings:

  - You are about to drop the column `ebayItemId` on the `PurchaseOrder` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `PurchaseOrder` table. All the data in the column will be lost.
  - The `status` column on the `PurchaseOrder` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `quotedPrice` to the `PurchaseOrder` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopId` to the `PurchaseOrder` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Supplier" AS ENUM ('EBAY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'PURCHASED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "OrderCancelReason" AS ENUM ('OUT_OF_STOCK', 'PRICE_CHANGED', 'SHOP_REQUESTED', 'OTHER');

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_candidateId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_partLineId_fkey";

-- AlterTable
ALTER TABLE "PurchaseOrder" DROP COLUMN "ebayItemId",
DROP COLUMN "price",
ADD COLUMN     "actualCost" DECIMAL(10,2),
ADD COLUMN     "amountPaid" DECIMAL(10,2),
ADD COLUMN     "cancelReason" "OrderCancelReason",
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "carrier" TEXT,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "externalOrderId" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "orderedByUserId" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "purchasedAt" TIMESTAMP(3),
ADD COLUMN     "quotedPrice" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "refundedAmount" DECIMAL(10,2),
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "shipToCity" TEXT,
ADD COLUMN     "shipToLine1" TEXT,
ADD COLUMN     "shipToLine2" TEXT,
ADD COLUMN     "shipToPhone" TEXT,
ADD COLUMN     "shipToState" TEXT,
ADD COLUMN     "shipToZip" TEXT,
ADD COLUMN     "shippedAt" TIMESTAMP(3),
ADD COLUMN     "shopId" TEXT NOT NULL,
ADD COLUMN     "stripePaymentIntentId" TEXT,
ADD COLUMN     "stripeRefundId" TEXT,
ADD COLUMN     "supplier" "Supplier" NOT NULL DEFAULT 'EBAY',
ADD COLUMN     "supplierItemId" TEXT,
ADD COLUMN     "supplierItemUrl" TEXT,
ADD COLUMN     "supplierName" TEXT,
ADD COLUMN     "trackingNumber" TEXT,
ADD COLUMN     "trackingUrl" TEXT,
ALTER COLUMN "partLineId" DROP NOT NULL,
ALTER COLUMN "candidateId" DROP NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT';

-- CreateIndex
CREATE INDEX "PurchaseOrder_shopId_status_idx" ON "PurchaseOrder"("shopId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_orderedByUserId_fkey" FOREIGN KEY ("orderedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_partLineId_fkey" FOREIGN KEY ("partLineId") REFERENCES "PartLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
