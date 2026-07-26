-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- AlterTable
ALTER TABLE "MatchSearch" ADD COLUMN     "queryPcdbPartId" INTEGER,
ADD COLUMN     "queryPcdbSubCategoryId" INTEGER;

-- CreateIndex
CREATE INDEX "idx_pcdbpart_name_trgm" ON "PcdbPart" USING GIN ("name" gin_trgm_ops);
