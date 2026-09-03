
-- CreateTable
CREATE TABLE "VcdbEngineBlock" (
    "id" INTEGER NOT NULL,
    "liter" TEXT,
    "cc" TEXT,
    "cid" TEXT,
    "cylinders" TEXT,
    "blockType" TEXT,

    CONSTRAINT "VcdbEngineBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbEngineBoreStroke" (
    "id" INTEGER NOT NULL,
    "boreIn" TEXT,
    "boreMetric" TEXT,
    "strokeIn" TEXT,
    "strokeMetric" TEXT,

    CONSTRAINT "VcdbEngineBoreStroke_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbEngineBase" (
    "id" INTEGER NOT NULL,
    "engineBlockId" INTEGER NOT NULL,
    "engineBoreStrokeId" INTEGER NOT NULL,

    CONSTRAINT "VcdbEngineBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbAspiration" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbAspiration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbCylinderHeadType" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbCylinderHeadType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbFuelType" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbFuelType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbFuelDeliveryType" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbFuelDeliveryType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbFuelDeliverySubType" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbFuelDeliverySubType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbFuelSystemControlType" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbFuelSystemControlType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbFuelSystemDesign" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbFuelSystemDesign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbFuelDeliveryConfig" (
    "id" INTEGER NOT NULL,
    "fuelDeliveryTypeId" INTEGER NOT NULL,
    "fuelDeliverySubTypeId" INTEGER NOT NULL,
    "fuelSystemControlTypeId" INTEGER NOT NULL,
    "fuelSystemDesignId" INTEGER NOT NULL,

    CONSTRAINT "VcdbFuelDeliveryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbIgnitionSystemType" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbIgnitionSystemType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbValves" (
    "id" INTEGER NOT NULL,
    "valvesPerEngine" TEXT,

    CONSTRAINT "VcdbValves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbEngineDesignation" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbEngineDesignation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbEngineVin" (
    "id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "VcdbEngineVin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbEngineVersion" (
    "id" INTEGER NOT NULL,
    "version" TEXT NOT NULL,

    CONSTRAINT "VcdbEngineVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbPowerOutput" (
    "id" INTEGER NOT NULL,
    "horsePower" TEXT,
    "kilowattPower" TEXT,

    CONSTRAINT "VcdbPowerOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbMfr" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbMfr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbEngineConfig" (
    "id" INTEGER NOT NULL,
    "engineBaseId" INTEGER NOT NULL,
    "engineBlockId" INTEGER NOT NULL,
    "engineBoreStrokeId" INTEGER NOT NULL,
    "aspirationId" INTEGER NOT NULL,
    "cylinderHeadTypeId" INTEGER NOT NULL,
    "fuelTypeId" INTEGER NOT NULL,
    "fuelDeliveryConfigId" INTEGER NOT NULL,
    "ignitionSystemTypeId" INTEGER NOT NULL,
    "engineMfrId" INTEGER NOT NULL,
    "engineVersionId" INTEGER NOT NULL,
    "powerOutputId" INTEGER NOT NULL,
    "engineDesignationId" INTEGER NOT NULL,
    "engineVinId" INTEGER NOT NULL,
    "valvesId" INTEGER NOT NULL,

    CONSTRAINT "VcdbEngineConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbTransmissionType" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbTransmissionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbTransmissionNumSpeeds" (
    "id" INTEGER NOT NULL,
    "speeds" TEXT NOT NULL,

    CONSTRAINT "VcdbTransmissionNumSpeeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbTransmissionControlType" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbTransmissionControlType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbTransmissionMfrCode" (
    "id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "VcdbTransmissionMfrCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbElecControlled" (
    "id" INTEGER NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "VcdbElecControlled_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbTransmissionBase" (
    "id" INTEGER NOT NULL,
    "transmissionTypeId" INTEGER NOT NULL,
    "transmissionNumSpeedsId" INTEGER NOT NULL,
    "transmissionControlTypeId" INTEGER NOT NULL,

    CONSTRAINT "VcdbTransmissionBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbTransmission" (
    "id" INTEGER NOT NULL,
    "transmissionBaseId" INTEGER NOT NULL,
    "transmissionMfrCodeId" INTEGER NOT NULL,
    "transmissionElecControlledId" INTEGER NOT NULL,
    "transmissionMfrId" INTEGER NOT NULL,

    CONSTRAINT "VcdbTransmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbDriveType" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbDriveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbBrakeType" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbBrakeType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbBrakeSystem" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbBrakeSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbBrakeAbs" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbBrakeAbs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbBrakeConfig" (
    "id" INTEGER NOT NULL,
    "frontBrakeTypeId" INTEGER NOT NULL,
    "rearBrakeTypeId" INTEGER NOT NULL,
    "brakeSystemId" INTEGER NOT NULL,
    "brakeAbsId" INTEGER NOT NULL,

    CONSTRAINT "VcdbBrakeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbBodyType" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbBodyType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbBodyNumDoors" (
    "id" INTEGER NOT NULL,
    "numDoors" TEXT NOT NULL,

    CONSTRAINT "VcdbBodyNumDoors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbBodyStyleConfig" (
    "id" INTEGER NOT NULL,
    "bodyNumDoorsId" INTEGER NOT NULL,
    "bodyTypeId" INTEGER NOT NULL,

    CONSTRAINT "VcdbBodyStyleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbBedLength" (
    "id" INTEGER NOT NULL,
    "bedLength" TEXT,
    "bedLengthMetric" TEXT,

    CONSTRAINT "VcdbBedLength_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbBedType" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbBedType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbBedConfig" (
    "id" INTEGER NOT NULL,
    "bedLengthId" INTEGER NOT NULL,
    "bedTypeId" INTEGER NOT NULL,

    CONSTRAINT "VcdbBedConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbWheelBase" (
    "id" INTEGER NOT NULL,
    "wheelBase" TEXT,
    "wheelBaseMetric" TEXT,

    CONSTRAINT "VcdbWheelBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbSpringType" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbSpringType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbSpringTypeConfig" (
    "id" INTEGER NOT NULL,
    "frontSpringTypeId" INTEGER NOT NULL,
    "rearSpringTypeId" INTEGER NOT NULL,

    CONSTRAINT "VcdbSpringTypeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbSteeringType" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbSteeringType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbSteeringSystem" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbSteeringSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbSteeringConfig" (
    "id" INTEGER NOT NULL,
    "steeringTypeId" INTEGER NOT NULL,
    "steeringSystemId" INTEGER NOT NULL,

    CONSTRAINT "VcdbSteeringConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbMfrBodyCode" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbMfrBodyCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbClass" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VcdbClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbRegion" (
    "id" INTEGER NOT NULL,
    "abbr" TEXT,
    "name" TEXT,

    CONSTRAINT "VcdbRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbVehicleToEngineConfig" (
    "id" INTEGER NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "engineConfigId" INTEGER NOT NULL,

    CONSTRAINT "VcdbVehicleToEngineConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbVehicleToTransmission" (
    "id" INTEGER NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "transmissionId" INTEGER NOT NULL,

    CONSTRAINT "VcdbVehicleToTransmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbVehicleToDriveType" (
    "id" INTEGER NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "driveTypeId" INTEGER NOT NULL,

    CONSTRAINT "VcdbVehicleToDriveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbVehicleToBrakeConfig" (
    "id" INTEGER NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "brakeConfigId" INTEGER NOT NULL,

    CONSTRAINT "VcdbVehicleToBrakeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbVehicleToBodyStyleConfig" (
    "id" INTEGER NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "bodyStyleConfigId" INTEGER NOT NULL,

    CONSTRAINT "VcdbVehicleToBodyStyleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbVehicleToBedConfig" (
    "id" INTEGER NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "bedConfigId" INTEGER NOT NULL,

    CONSTRAINT "VcdbVehicleToBedConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbVehicleToWheelBase" (
    "id" INTEGER NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "wheelBaseId" INTEGER NOT NULL,

    CONSTRAINT "VcdbVehicleToWheelBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbVehicleToSpringTypeConfig" (
    "id" INTEGER NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "springTypeConfigId" INTEGER NOT NULL,

    CONSTRAINT "VcdbVehicleToSpringTypeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbVehicleToSteeringConfig" (
    "id" INTEGER NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "steeringConfigId" INTEGER NOT NULL,

    CONSTRAINT "VcdbVehicleToSteeringConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbVehicleToMfrBodyCode" (
    "id" INTEGER NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "mfrBodyCodeId" INTEGER NOT NULL,

    CONSTRAINT "VcdbVehicleToMfrBodyCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VcdbVehicleToClass" (
    "id" INTEGER NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,

    CONSTRAINT "VcdbVehicleToClass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VcdbEngineBase_engineBlockId_idx" ON "VcdbEngineBase"("engineBlockId");

-- CreateIndex
CREATE INDEX "VcdbFuelDeliveryConfig_fuelDeliveryTypeId_idx" ON "VcdbFuelDeliveryConfig"("fuelDeliveryTypeId");

-- CreateIndex
CREATE INDEX "VcdbEngineConfig_engineBaseId_idx" ON "VcdbEngineConfig"("engineBaseId");

-- CreateIndex
CREATE INDEX "VcdbTransmissionBase_transmissionTypeId_idx" ON "VcdbTransmissionBase"("transmissionTypeId");

-- CreateIndex
CREATE INDEX "VcdbTransmission_transmissionBaseId_idx" ON "VcdbTransmission"("transmissionBaseId");

-- CreateIndex
CREATE INDEX "VcdbBrakeConfig_frontBrakeTypeId_idx" ON "VcdbBrakeConfig"("frontBrakeTypeId");

-- CreateIndex
CREATE INDEX "VcdbBodyStyleConfig_bodyNumDoorsId_idx" ON "VcdbBodyStyleConfig"("bodyNumDoorsId");

-- CreateIndex
CREATE INDEX "VcdbBedConfig_bedLengthId_idx" ON "VcdbBedConfig"("bedLengthId");

-- CreateIndex
CREATE INDEX "VcdbSpringTypeConfig_frontSpringTypeId_idx" ON "VcdbSpringTypeConfig"("frontSpringTypeId");

-- CreateIndex
CREATE INDEX "VcdbSteeringConfig_steeringTypeId_idx" ON "VcdbSteeringConfig"("steeringTypeId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToEngineConfig_vehicleId_idx" ON "VcdbVehicleToEngineConfig"("vehicleId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToEngineConfig_engineConfigId_idx" ON "VcdbVehicleToEngineConfig"("engineConfigId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToTransmission_vehicleId_idx" ON "VcdbVehicleToTransmission"("vehicleId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToTransmission_transmissionId_idx" ON "VcdbVehicleToTransmission"("transmissionId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToDriveType_vehicleId_idx" ON "VcdbVehicleToDriveType"("vehicleId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToDriveType_driveTypeId_idx" ON "VcdbVehicleToDriveType"("driveTypeId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToBrakeConfig_vehicleId_idx" ON "VcdbVehicleToBrakeConfig"("vehicleId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToBrakeConfig_brakeConfigId_idx" ON "VcdbVehicleToBrakeConfig"("brakeConfigId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToBodyStyleConfig_vehicleId_idx" ON "VcdbVehicleToBodyStyleConfig"("vehicleId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToBodyStyleConfig_bodyStyleConfigId_idx" ON "VcdbVehicleToBodyStyleConfig"("bodyStyleConfigId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToBedConfig_vehicleId_idx" ON "VcdbVehicleToBedConfig"("vehicleId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToBedConfig_bedConfigId_idx" ON "VcdbVehicleToBedConfig"("bedConfigId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToWheelBase_vehicleId_idx" ON "VcdbVehicleToWheelBase"("vehicleId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToWheelBase_wheelBaseId_idx" ON "VcdbVehicleToWheelBase"("wheelBaseId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToSpringTypeConfig_vehicleId_idx" ON "VcdbVehicleToSpringTypeConfig"("vehicleId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToSpringTypeConfig_springTypeConfigId_idx" ON "VcdbVehicleToSpringTypeConfig"("springTypeConfigId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToSteeringConfig_vehicleId_idx" ON "VcdbVehicleToSteeringConfig"("vehicleId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToSteeringConfig_steeringConfigId_idx" ON "VcdbVehicleToSteeringConfig"("steeringConfigId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToMfrBodyCode_vehicleId_idx" ON "VcdbVehicleToMfrBodyCode"("vehicleId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToMfrBodyCode_mfrBodyCodeId_idx" ON "VcdbVehicleToMfrBodyCode"("mfrBodyCodeId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToClass_vehicleId_idx" ON "VcdbVehicleToClass"("vehicleId");

-- CreateIndex
CREATE INDEX "VcdbVehicleToClass_classId_idx" ON "VcdbVehicleToClass"("classId");

