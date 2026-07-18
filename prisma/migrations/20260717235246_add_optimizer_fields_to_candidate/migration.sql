-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "optimizerGateReason" TEXT,
ADD COLUMN     "optimizerPriceScore" DOUBLE PRECISION,
ADD COLUMN     "optimizerQualityScore" DOUBLE PRECISION,
ADD COLUMN     "optimizerRank" INTEGER,
ADD COLUMN     "optimizerTotal" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Candidate_matchSearchId_optimizerRank_idx" ON "Candidate"("matchSearchId", "optimizerRank");
