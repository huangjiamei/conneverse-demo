-- CreateTable
CREATE TABLE "DisplayBucket" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "displayCategoryId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DisplayBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcategoryDisplayMap" (
    "pcdbCategoryId" INTEGER NOT NULL,
    "pcdbSubCategoryId" INTEGER NOT NULL,
    "displayBucketId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SubcategoryDisplayMap_pkey" PRIMARY KEY ("pcdbCategoryId","pcdbSubCategoryId")
);

-- CreateIndex
CREATE INDEX "DisplayBucket_displayCategoryId_idx" ON "DisplayBucket"("displayCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "DisplayBucket_displayCategoryId_name_key" ON "DisplayBucket"("displayCategoryId", "name");

-- CreateIndex
CREATE INDEX "SubcategoryDisplayMap_displayBucketId_idx" ON "SubcategoryDisplayMap"("displayBucketId");

-- CreateIndex
CREATE INDEX "SubcategoryDisplayMap_pcdbSubCategoryId_idx" ON "SubcategoryDisplayMap"("pcdbSubCategoryId");

-- AddForeignKey
ALTER TABLE "DisplayBucket" ADD CONSTRAINT "DisplayBucket_displayCategoryId_fkey" FOREIGN KEY ("displayCategoryId") REFERENCES "DisplayCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcategoryDisplayMap" ADD CONSTRAINT "SubcategoryDisplayMap_displayBucketId_fkey" FOREIGN KEY ("displayBucketId") REFERENCES "DisplayBucket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
