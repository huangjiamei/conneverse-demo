-- AlterTable
-- 新建 PartLine 的默认 preset: Balanced -> Budget。
-- 只改列默认值, 已有行保留各自存的值 (历史 PartLine 上的 Balanced/Rush 等不动)。
ALTER TABLE "PartLine" ALTER COLUMN "selectedPreset" SET DEFAULT 'Budget';
