-- CreateTable
CREATE TABLE "PadbPartAttribute" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "PadbPartAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadbMetaData" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "dataType" TEXT,

    CONSTRAINT "PadbMetaData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadbValidValue" (
    "id" INTEGER NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "PadbValidValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadbMetaUom" (
    "id" INTEGER NOT NULL,
    "uomCode" TEXT,
    "uomLabel" TEXT,
    "measurementGroupId" INTEGER,

    CONSTRAINT "PadbMetaUom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadbPartAttributeAssignment" (
    "id" INTEGER NOT NULL,
    "partTerminologyId" INTEGER NOT NULL,
    "paid" INTEGER NOT NULL,
    "metaId" INTEGER NOT NULL,

    CONSTRAINT "PadbPartAttributeAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadbValidValueAssignment" (
    "id" INTEGER NOT NULL,
    "paptid" INTEGER NOT NULL,
    "validValueId" INTEGER NOT NULL,

    CONSTRAINT "PadbValidValueAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadbMetaUomAssignment" (
    "id" INTEGER NOT NULL,
    "paptid" INTEGER NOT NULL,
    "metaUomId" INTEGER NOT NULL,

    CONSTRAINT "PadbMetaUomAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PcdbPosition" (
    "id" INTEGER NOT NULL,
    "position" TEXT NOT NULL,

    CONSTRAINT "PcdbPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PcdbPartPosition" (
    "id" INTEGER NOT NULL,
    "partTerminologyId" INTEGER NOT NULL,
    "positionId" INTEGER NOT NULL,

    CONSTRAINT "PcdbPartPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PadbPartAttribute_name_idx" ON "PadbPartAttribute"("name");

-- CreateIndex
CREATE INDEX "PadbValidValue_value_idx" ON "PadbValidValue"("value");

-- CreateIndex
CREATE INDEX "PadbPartAttributeAssignment_partTerminologyId_idx" ON "PadbPartAttributeAssignment"("partTerminologyId");

-- CreateIndex
CREATE INDEX "PadbPartAttributeAssignment_paid_idx" ON "PadbPartAttributeAssignment"("paid");

-- CreateIndex
CREATE INDEX "PadbValidValueAssignment_paptid_idx" ON "PadbValidValueAssignment"("paptid");

-- CreateIndex
CREATE INDEX "PadbValidValueAssignment_validValueId_idx" ON "PadbValidValueAssignment"("validValueId");

-- CreateIndex
CREATE INDEX "PadbMetaUomAssignment_paptid_idx" ON "PadbMetaUomAssignment"("paptid");

-- CreateIndex
CREATE INDEX "PcdbPartPosition_partTerminologyId_idx" ON "PcdbPartPosition"("partTerminologyId");

-- CreateIndex
CREATE INDEX "PcdbPartPosition_positionId_idx" ON "PcdbPartPosition"("positionId");
