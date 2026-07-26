-- CreateTable
CREATE TABLE "EbayCategory" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" INTEGER,
    "level" INTEGER NOT NULL,
    "fullPath" TEXT NOT NULL,
    "isLeaf" BOOLEAN NOT NULL,

    CONSTRAINT "EbayCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EbayCategory_parentId_idx" ON "EbayCategory"("parentId");

-- CreateIndex
CREATE INDEX "EbayCategory_name_idx" ON "EbayCategory"("name");

-- AddForeignKey
ALTER TABLE "EbayCategory" ADD CONSTRAINT "EbayCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "EbayCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
