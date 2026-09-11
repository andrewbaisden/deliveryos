-- Restore composite tenant foreign keys dropped by 20260910204136_build1
-- when `prisma migrate dev` reconciled unmanaged raw-SQL constraints.
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_tenant_vehicle_fkey"
  FOREIGN KEY ("organizationId", "vehicleId") REFERENCES "Vehicle" ("organizationId", "id");
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_tenant_zone_fkey"
  FOREIGN KEY ("organizationId", "zoneId") REFERENCES "Zone" ("organizationId", "id");
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_tenant_simulation_fkey"
  FOREIGN KEY ("organizationId", "simulationRunId") REFERENCES "SimulationRun" ("organizationId", "id") ON DELETE CASCADE;
ALTER TABLE "DriverCredential" ADD CONSTRAINT "DriverCredential_tenant_driver_fkey"
  FOREIGN KEY ("organizationId", "driverId") REFERENCES "Driver" ("organizationId", "id") ON DELETE CASCADE;

ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_tenant_customer_fkey"
  FOREIGN KEY ("organizationId", "customerId") REFERENCES "Customer" ("organizationId", "id");
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_tenant_zone_fkey"
  FOREIGN KEY ("organizationId", "zoneId") REFERENCES "Zone" ("organizationId", "id");
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_tenant_driver_fkey"
  FOREIGN KEY ("organizationId", "assignedDriverId") REFERENCES "Driver" ("organizationId", "id");
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_tenant_simulation_fkey"
  FOREIGN KEY ("organizationId", "simulationRunId") REFERENCES "SimulationRun" ("organizationId", "id") ON DELETE CASCADE;
ALTER TABLE "DeliveryStop" ADD CONSTRAINT "DeliveryStop_tenant_delivery_fkey"
  FOREIGN KEY ("organizationId", "deliveryId") REFERENCES "Delivery" ("organizationId", "id") ON DELETE CASCADE;
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_tenant_delivery_fkey"
  FOREIGN KEY ("organizationId", "deliveryId") REFERENCES "Delivery" ("organizationId", "id") ON DELETE CASCADE;
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_tenant_driver_fkey"
  FOREIGN KEY ("organizationId", "driverId") REFERENCES "Driver" ("organizationId", "id");
ALTER TABLE "Route" ADD CONSTRAINT "Route_tenant_delivery_fkey"
  FOREIGN KEY ("organizationId", "deliveryId") REFERENCES "Delivery" ("organizationId", "id") ON DELETE CASCADE;

ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_tenant_delivery_fkey"
  FOREIGN KEY ("organizationId", "deliveryId") REFERENCES "Delivery" ("organizationId", "id") ON DELETE CASCADE;
ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_tenant_driver_fkey"
  FOREIGN KEY ("organizationId", "driverId") REFERENCES "Driver" ("organizationId", "id") ON DELETE CASCADE;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_tenant_event_fkey"
  FOREIGN KEY ("organizationId", "domainEventId") REFERENCES "DomainEvent" ("organizationId", "id") ON DELETE CASCADE;
ALTER TABLE "DriverLocationSnapshot" ADD CONSTRAINT "DriverLocationSnapshot_tenant_driver_fkey"
  FOREIGN KEY ("organizationId", "driverId") REFERENCES "Driver" ("organizationId", "id") ON DELETE CASCADE;
ALTER TABLE "TrackingToken" ADD CONSTRAINT "TrackingToken_tenant_delivery_fkey"
  FOREIGN KEY ("organizationId", "deliveryId") REFERENCES "Delivery" ("organizationId", "id") ON DELETE CASCADE;
ALTER TABLE "OperationalAlert" ADD CONSTRAINT "OperationalAlert_tenant_delivery_fkey"
  FOREIGN KEY ("organizationId", "deliveryId") REFERENCES "Delivery" ("organizationId", "id") ON DELETE CASCADE;
ALTER TABLE "OperationalAlert" ADD CONSTRAINT "OperationalAlert_tenant_driver_fkey"
  FOREIGN KEY ("organizationId", "driverId") REFERENCES "Driver" ("organizationId", "id") ON DELETE CASCADE;
