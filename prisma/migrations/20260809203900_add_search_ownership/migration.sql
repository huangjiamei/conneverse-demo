-- AlterTable
ALTER TABLE "MatchSearch" ADD COLUMN     "shopId" TEXT,
ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "MatchSearch_userId_idx" ON "MatchSearch"("userId");

-- CreateIndex
CREATE INDEX "MatchSearch_shopId_idx" ON "MatchSearch"("shopId");

-- AddForeignKey
ALTER TABLE "MatchSearch" ADD CONSTRAINT "MatchSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSearch" ADD CONSTRAINT "MatchSearch_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
