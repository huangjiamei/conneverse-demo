-- AlterTable
ALTER TABLE "PartLine" ADD COLUMN     "selectedPreset" TEXT NOT NULL DEFAULT 'sameDayJob';

-- CreateTable
CREATE TABLE "OptimizerResult" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "preset" TEXT NOT NULL,
    "matchSearchId" TEXT NOT NULL,
    "rank" INTEGER,
    "total" DOUBLE PRECISION,
    "priceScore" DOUBLE PRECISION,
    "qualityScore" DOUBLE PRECISION,
    "gateReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptimizerResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OptimizerResult_matchSearchId_preset_idx" ON "OptimizerResult"("matchSearchId", "preset");

-- CreateIndex
CREATE INDEX "OptimizerResult_candidateId_idx" ON "OptimizerResult"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "OptimizerResult_candidateId_preset_key" ON "OptimizerResult"("candidateId", "preset");

-- AddForeignKey
ALTER TABLE "OptimizerResult" ADD CONSTRAINT "OptimizerResult_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptimizerResult" ADD CONSTRAINT "OptimizerResult_matchSearchId_fkey" FOREIGN KEY ("matchSearchId") REFERENCES "MatchSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
