-- CreateTable
CREATE TABLE "VcdbYear" (
    "id" INTEGER NOT NULL,

    CONSTRAINT "VcdbYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbMake" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbMake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbModel" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "vehicleTypeId" INTEGER NOT NULL,

    CONSTRAINT "VcdbModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbSubModel" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbSubModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbBaseVehicle" (
    "id" INTEGER NOT NULL,
    "yearId" INTEGER NOT NULL,
    "makeId" INTEGER NOT NULL,
    "modelId" INTEGER NOT NULL,

    CONSTRAINT "VcdbBaseVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbVehicle" (
    "id" INTEGER NOT NULL,
    "baseVehicleId" INTEGER NOT NULL,
    "subModelId" INTEGER NOT NULL,

    CONSTRAINT "VcdbVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VcdbMake_name_idx" ON "VcdbMake"("name");

-- CreateIndex
CREATE INDEX "VcdbModel_name_idx" ON "VcdbModel"("name");

-- CreateIndex
CREATE INDEX "VcdbModel_vehicleTypeId_idx" ON "VcdbModel"("vehicleTypeId");

-- CreateIndex
CREATE INDEX "VcdbBaseVehicle_yearId_makeId_modelId_idx" ON "VcdbBaseVehicle"("yearId", "makeId", "modelId");

-- CreateIndex
CREATE INDEX "VcdbBaseVehicle_makeId_yearId_idx" ON "VcdbBaseVehicle"("makeId", "yearId");

-- CreateIndex
CREATE INDEX "VcdbBaseVehicle_yearId_idx" ON "VcdbBaseVehicle"("yearId");

-- CreateIndex
CREATE INDEX "VcdbVehicle_baseVehicleId_subModelId_idx" ON "VcdbVehicle"("baseVehicleId", "subModelId");

-- AddForeignKey
ALTER TABLE "VcdbBaseVehicle" ADD CONSTRAINT "VcdbBaseVehicle_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "VcdbYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VcdbBaseVehicle" ADD CONSTRAINT "VcdbBaseVehicle_makeId_fkey" FOREIGN KEY ("makeId") REFERENCES "VcdbMake"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VcdbBaseVehicle" ADD CONSTRAINT "VcdbBaseVehicle_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "VcdbModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VcdbVehicle" ADD CONSTRAINT "VcdbVehicle_baseVehicleId_fkey" FOREIGN KEY ("baseVehicleId") REFERENCES "VcdbBaseVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VcdbVehicle" ADD CONSTRAINT "VcdbVehicle_subModelId_fkey" FOREIGN KEY ("subModelId") REFERENCES "VcdbSubModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
