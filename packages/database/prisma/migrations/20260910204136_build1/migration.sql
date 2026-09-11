-- DropForeignKey
ALTER TABLE "Delivery" DROP CONSTRAINT "Delivery_tenant_customer_fkey";

-- DropForeignKey
ALTER TABLE "Delivery" DROP CONSTRAINT "Delivery_tenant_driver_fkey";

-- DropForeignKey
ALTER TABLE "Delivery" DROP CONSTRAINT "Delivery_tenant_simulation_fkey";

-- DropForeignKey
ALTER TABLE "Delivery" DROP CONSTRAINT "Delivery_tenant_zone_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryAssignment" DROP CONSTRAINT "DeliveryAssignment_tenant_delivery_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryAssignment" DROP CONSTRAINT "DeliveryAssignment_tenant_driver_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryStop" DROP CONSTRAINT "DeliveryStop_tenant_delivery_fkey";

-- DropForeignKey
ALTER TABLE "DomainEvent" DROP CONSTRAINT "DomainEvent_tenant_delivery_fkey";

-- DropForeignKey
ALTER TABLE "DomainEvent" DROP CONSTRAINT "DomainEvent_tenant_driver_fkey";

-- DropForeignKey
ALTER TABLE "Driver" DROP CONSTRAINT "Driver_tenant_simulation_fkey";

-- DropForeignKey
ALTER TABLE "Driver" DROP CONSTRAINT "Driver_tenant_vehicle_fkey";

-- DropForeignKey
ALTER TABLE "Driver" DROP CONSTRAINT "Driver_tenant_zone_fkey";

-- DropForeignKey
ALTER TABLE "DriverCredential" DROP CONSTRAINT "DriverCredential_tenant_driver_fkey";

-- DropForeignKey
ALTER TABLE "DriverLocationSnapshot" DROP CONSTRAINT "DriverLocationSnapshot_tenant_driver_fkey";

-- DropForeignKey
ALTER TABLE "OperationalAlert" DROP CONSTRAINT "OperationalAlert_tenant_delivery_fkey";

-- DropForeignKey
ALTER TABLE "OperationalAlert" DROP CONSTRAINT "OperationalAlert_tenant_driver_fkey";

-- DropForeignKey
ALTER TABLE "OutboxEvent" DROP CONSTRAINT "OutboxEvent_tenant_event_fkey";

-- DropForeignKey
ALTER TABLE "Route" DROP CONSTRAINT "Route_tenant_delivery_fkey";

-- DropForeignKey
ALTER TABLE "TrackingToken" DROP CONSTRAINT "TrackingToken_tenant_delivery_fkey";

-- AlterTable
ALTER TABLE "SimulationRun" ALTER COLUMN "driverCount" DROP DEFAULT;
