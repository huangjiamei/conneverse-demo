-- CreateTable
CREATE TABLE "DisplayCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DisplayCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryDisplayMap" (
    "pcdbCategoryId" INTEGER NOT NULL,
    "displayCategoryId" INTEGER,

    CONSTRAINT "CategoryDisplayMap_pkey" PRIMARY KEY ("pcdbCategoryId")
);

-- CreateIndex
CREATE UNIQUE INDEX "DisplayCategory_name_key" ON "DisplayCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DisplayCategory_slug_key" ON "DisplayCategory"("slug");

-- AddForeignKey
ALTER TABLE "CategoryDisplayMap" ADD CONSTRAINT "CategoryDisplayMap_displayCategoryId_fkey" FOREIGN KEY ("displayCategoryId") REFERENCES "DisplayCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryDisplayMap" ADD CONSTRAINT "CategoryDisplayMap_pcdbCategoryId_fkey" FOREIGN KEY ("pcdbCategoryId") REFERENCES "PcdbCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
