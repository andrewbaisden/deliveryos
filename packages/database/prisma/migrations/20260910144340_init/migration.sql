-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('ADMIN', 'DISPATCHER', 'DRIVER');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('OFFLINE', 'AVAILABLE', 'ASSIGNED', 'ON_DELIVERY', 'ON_BREAK');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('CAR', 'VAN', 'BIKE', 'CARGO_BIKE');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'ACCEPTED', 'EN_ROUTE_TO_PICKUP', 'ARRIVED_PICKUP', 'PICKED_UP', 'EN_ROUTE_TO_DROPOFF', 'ARRIVED_DROPOFF', 'DELIVERED', 'FAILED', 'CANCELLED', 'RETURN_REQUIRED');

-- CreateEnum
CREATE TYPE "DeliveryPriority" AS ENUM ('STANDARD', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "DeliveryRisk" AS ENUM ('ON_TIME', 'AT_RISK', 'DELAYED');

-- CreateEnum
CREATE TYPE "StopKind" AS ENUM ('PICKUP', 'DROPOFF');

-- CreateEnum
CREATE TYPE "AssignmentEndReason" AS ENUM ('UNASSIGNED', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "RouteLegType" AS ENUM ('TO_PICKUP', 'TO_DROPOFF');

-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'STALE');

-- CreateEnum
CREATE TYPE "AggregateType" AS ENUM ('DELIVERY', 'DRIVER', 'ALERT', 'SIMULATION');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'DRIVER', 'SYSTEM', 'SIMULATOR');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('DELIVERY_AT_RISK', 'DELIVERY_DELAYED', 'DRIVER_STALE', 'DRIVER_OFFLINE', 'ROUTE_DEVIATION', 'PICKUP_WAIT');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SimulationScenario" AS ENUM ('NORMAL_SHIFT', 'PEAK_PERIOD', 'DISRUPTION', 'LATE_SHIFT');

-- CreateEnum
CREATE TYPE "SimulationStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'STOPPED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" UUID NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/London',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "boundary" JSONB,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "VehicleType" NOT NULL,
    "label" TEXT NOT NULL,
    "registration" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "vehicleId" UUID,
    "zoneId" UUID,
    "simulationRunId" UUID,
    "name" TEXT NOT NULL,
    "status" "DriverStatus" NOT NULL DEFAULT 'OFFLINE',
    "maxConcurrentDeliveries" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverCredential" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "prefix" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "zoneId" UUID,
    "assignedDriverId" UUID,
    "simulationRunId" UUID,
    "reference" TEXT NOT NULL,
    "externalReference" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "priority" "DeliveryPriority" NOT NULL DEFAULT 'STANDARD',
    "risk" "DeliveryRisk" NOT NULL DEFAULT 'ON_TIME',
    "version" INTEGER NOT NULL DEFAULT 1,
    "packageCount" INTEGER NOT NULL DEFAULT 1,
    "internalInstructions" TEXT,
    "plannedPickupAt" TIMESTAMP(3) NOT NULL,
    "promisedDeliveryAt" TIMESTAMP(3) NOT NULL,
    "originalEtaAt" TIMESTAMP(3),
    "currentEtaAt" TIMESTAMP(3),
    "actualPickupAt" TIMESTAMP(3),
    "actualDeliveryAt" TIMESTAMP(3),
    "recipientName" TEXT,
    "proofNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryStop" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" "StopKind" NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "instructions" TEXT,
    "geofenceRadiusM" INTEGER NOT NULL DEFAULT 75,
    "arrivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DeliveryStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryAssignment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "assignedById" UUID,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" "AssignmentEndReason",

    CONSTRAINT "DeliveryAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "legType" "RouteLegType" NOT NULL,
    "version" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "status" "RouteStatus" NOT NULL DEFAULT 'PENDING',
    "origin" JSONB NOT NULL,
    "destination" JSONB NOT NULL,
    "waypoints" JSONB,
    "geometry" JSONB,
    "encodedPolyline" TEXT,
    "distanceM" INTEGER,
    "durationSeconds" INTEGER,
    "calculationReason" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "calculatedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainEvent" (
    "id" UUID NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "organizationId" UUID NOT NULL,
    "aggregateType" "AggregateType" NOT NULL,
    "aggregateId" UUID NOT NULL,
    "deliveryId" UUID,
    "driverId" UUID,
    "eventType" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "correlationId" UUID,
    "causationId" UUID,
    "idempotencyKey" TEXT,

    CONSTRAINT "DomainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "domainEventId" UUID NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorFingerprint" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverLocationSnapshot" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "telemetryEventId" UUID NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "accuracyM" DOUBLE PRECISION,
    "speedMps" DOUBLE PRECISION,
    "headingDegrees" DOUBLE PRECISION,
    "batteryPct" DOUBLE PRECISION,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverLocationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingToken" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalAlert" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "deliveryId" UUID,
    "driverId" UUID,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "message" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "cooldownUntil" TIMESTAMP(3),

    CONSTRAINT "OperationalAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationRun" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "scenario" "SimulationScenario" NOT NULL,
    "scenarioVersion" INTEGER NOT NULL DEFAULT 1,
    "seed" BIGINT NOT NULL,
    "speed" INTEGER NOT NULL,
    "status" "SimulationStatus" NOT NULL DEFAULT 'DRAFT',
    "logicalTimeMs" BIGINT NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimulationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationAgent" (
    "id" UUID NOT NULL,
    "simulationRunId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "currentDeliveryId" UUID,
    "phase" TEXT NOT NULL,
    "routePositionM" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "randomState" BIGINT NOT NULL,
    "nextActionAtMs" BIGINT NOT NULL,
    "exceptionFlags" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimulationAgent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_organizationId_name_key" ON "Zone"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_organizationId_id_key" ON "Zone"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_organizationId_label_key" ON "Vehicle"("organizationId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_organizationId_id_key" ON "Vehicle"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_userId_key" ON "Driver"("userId");

-- CreateIndex
CREATE INDEX "Driver_organizationId_status_idx" ON "Driver"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_organizationId_id_key" ON "Driver"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DriverCredential_prefix_key" ON "DriverCredential"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "DriverCredential_secretHash_key" ON "DriverCredential"("secretHash");

-- CreateIndex
CREATE INDEX "DriverCredential_organizationId_driverId_idx" ON "DriverCredential"("organizationId", "driverId");

-- CreateIndex
CREATE INDEX "Customer_organizationId_name_idx" ON "Customer"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_organizationId_id_key" ON "Customer"("organizationId", "id");

-- CreateIndex
CREATE INDEX "Delivery_organizationId_status_createdAt_idx" ON "Delivery"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Delivery_organizationId_risk_status_idx" ON "Delivery"("organizationId", "risk", "status");

-- CreateIndex
CREATE INDEX "Delivery_assignedDriverId_status_idx" ON "Delivery"("assignedDriverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_organizationId_reference_key" ON "Delivery"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_organizationId_id_key" ON "Delivery"("organizationId", "id");

-- CreateIndex
CREATE INDEX "DeliveryStop_organizationId_deliveryId_idx" ON "DeliveryStop"("organizationId", "deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryStop_deliveryId_sequence_key" ON "DeliveryStop"("deliveryId", "sequence");

-- CreateIndex
CREATE INDEX "DeliveryAssignment_organizationId_driverId_endedAt_idx" ON "DeliveryAssignment"("organizationId", "driverId", "endedAt");

-- CreateIndex
CREATE INDEX "DeliveryAssignment_deliveryId_assignedAt_idx" ON "DeliveryAssignment"("deliveryId", "assignedAt");

-- CreateIndex
CREATE INDEX "Route_organizationId_deliveryId_isActive_idx" ON "Route"("organizationId", "deliveryId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Route_deliveryId_legType_version_key" ON "Route"("deliveryId", "legType", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DomainEvent_sequence_key" ON "DomainEvent"("sequence");

-- CreateIndex
CREATE INDEX "DomainEvent_organizationId_occurredAt_idx" ON "DomainEvent"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "DomainEvent_deliveryId_sequence_idx" ON "DomainEvent"("deliveryId", "sequence");

-- CreateIndex
CREATE INDEX "DomainEvent_driverId_sequence_idx" ON "DomainEvent"("driverId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_domainEventId_key" ON "OutboxEvent"("domainEventId");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_organizationId_actorFingerprint_key_key" ON "IdempotencyRecord"("organizationId", "actorFingerprint", "key");

-- CreateIndex
CREATE INDEX "DriverLocationSnapshot_organizationId_driverId_observedAt_idx" ON "DriverLocationSnapshot"("organizationId", "driverId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DriverLocationSnapshot_driverId_telemetryEventId_key" ON "DriverLocationSnapshot"("driverId", "telemetryEventId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingToken_tokenHash_key" ON "TrackingToken"("tokenHash");

-- CreateIndex
CREATE INDEX "TrackingToken_deliveryId_revokedAt_idx" ON "TrackingToken"("deliveryId", "revokedAt");

-- CreateIndex
CREATE INDEX "OperationalAlert_organizationId_status_openedAt_idx" ON "OperationalAlert"("organizationId", "status", "openedAt");

-- CreateIndex
CREATE INDEX "SimulationRun_organizationId_status_idx" ON "SimulationRun"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SimulationAgent_driverId_key" ON "SimulationAgent"("driverId");

-- CreateIndex
CREATE INDEX "SimulationAgent_simulationRunId_nextActionAtMs_idx" ON "SimulationAgent"("simulationRunId", "nextActionAtMs");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_simulationRunId_fkey" FOREIGN KEY ("simulationRunId") REFERENCES "SimulationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverCredential" ADD CONSTRAINT "DriverCredential_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_simulationRunId_fkey" FOREIGN KEY ("simulationRunId") REFERENCES "SimulationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryStop" ADD CONSTRAINT "DeliveryStop_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_domainEventId_fkey" FOREIGN KEY ("domainEventId") REFERENCES "DomainEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverLocationSnapshot" ADD CONSTRAINT "DriverLocationSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverLocationSnapshot" ADD CONSTRAINT "DriverLocationSnapshot_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingToken" ADD CONSTRAINT "TrackingToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingToken" ADD CONSTRAINT "TrackingToken_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAlert" ADD CONSTRAINT "OperationalAlert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAlert" ADD CONSTRAINT "OperationalAlert_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAlert" ADD CONSTRAINT "OperationalAlert_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationRun" ADD CONSTRAINT "SimulationRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationAgent" ADD CONSTRAINT "SimulationAgent_simulationRunId_fkey" FOREIGN KEY ("simulationRunId") REFERENCES "SimulationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationAgent" ADD CONSTRAINT "SimulationAgent_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationAgent" ADD CONSTRAINT "SimulationAgent_currentDeliveryId_fkey" FOREIGN KEY ("currentDeliveryId") REFERENCES "Delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
