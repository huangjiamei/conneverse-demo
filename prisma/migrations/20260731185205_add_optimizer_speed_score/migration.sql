-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "optimizerSpeedScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "OptimizerResult" ADD COLUMN     "speedScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "PartLine" ALTER COLUMN "selectedPreset" SET DEFAULT 'Balanced';
