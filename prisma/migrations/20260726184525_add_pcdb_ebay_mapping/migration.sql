-- CreateTable
CREATE TABLE "PcdbToEbayMapping" (
    "id" SERIAL NOT NULL,
    "subCategoryId" INTEGER NOT NULL,
    "primaryEbayId" INTEGER,
    "fallbackEbayIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "confidence" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "PcdbToEbayMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PcdbToEbayMapping_subCategoryId_key" ON "PcdbToEbayMapping"("subCategoryId");

-- CreateIndex
CREATE INDEX "PcdbToEbayMapping_subCategoryId_idx" ON "PcdbToEbayMapping"("subCategoryId");

-- AddForeignKey
ALTER TABLE "PcdbToEbayMapping" ADD CONSTRAINT "PcdbToEbayMapping_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "PcdbSubCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
