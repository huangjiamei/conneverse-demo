-- CreateTable
CREATE TABLE "PcdbCategory" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "PcdbCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PcdbSubCategory" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "PcdbSubCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PcdbPart" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "PcdbPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PcdbPartCategory" (
    "id" SERIAL NOT NULL,
    "partId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "subCategoryId" INTEGER NOT NULL,

    CONSTRAINT "PcdbPartCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PcdbCategory_name_idx" ON "PcdbCategory"("name");

-- CreateIndex
CREATE INDEX "PcdbSubCategory_name_idx" ON "PcdbSubCategory"("name");

-- CreateIndex
CREATE INDEX "PcdbPart_name_idx" ON "PcdbPart"("name");

-- CreateIndex
CREATE INDEX "PcdbPartCategory_categoryId_subCategoryId_idx" ON "PcdbPartCategory"("categoryId", "subCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "PcdbPartCategory_partId_categoryId_subCategoryId_key" ON "PcdbPartCategory"("partId", "categoryId", "subCategoryId");

-- AddForeignKey
ALTER TABLE "PcdbPartCategory" ADD CONSTRAINT "PcdbPartCategory_partId_fkey" FOREIGN KEY ("partId") REFERENCES "PcdbPart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PcdbPartCategory" ADD CONSTRAINT "PcdbPartCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PcdbCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PcdbPartCategory" ADD CONSTRAINT "PcdbPartCategory_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "PcdbSubCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
