-- Domain constraints and partial indexes that Prisma cannot express.
CREATE UNIQUE INDEX "one_active_assignment_per_delivery"
  ON "DeliveryAssignment" ("deliveryId") WHERE "endedAt" IS NULL;

CREATE UNIQUE INDEX "one_active_tracking_token_per_delivery"
  ON "TrackingToken" ("deliveryId") WHERE "revokedAt" IS NULL;

CREATE UNIQUE INDEX "one_running_simulation_per_organization"
  ON "SimulationRun" ("organizationId") WHERE "status" = 'RUNNING';

ALTER TABLE "Driver" ADD CONSTRAINT "driver_capacity_positive" CHECK ("maxConcurrentDeliveries" > 0);
ALTER TABLE "Vehicle" ADD CONSTRAINT "vehicle_capacity_positive" CHECK ("capacity" > 0);
ALTER TABLE "Delivery" ADD CONSTRAINT "package_count_positive" CHECK ("packageCount" > 0);
ALTER TABLE "DeliveryStop" ADD CONSTRAINT "latitude_valid" CHECK ("latitude" BETWEEN -90 AND 90);
ALTER TABLE "DeliveryStop" ADD CONSTRAINT "longitude_valid" CHECK ("longitude" BETWEEN -180 AND 180);
