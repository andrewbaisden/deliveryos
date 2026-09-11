-- Composite tenant foreign keys provide database-level defence in depth.
-- Prisma's single-column relations remain for client ergonomics; these additional
-- constraints prevent a tenant-owned row from referencing another organisation.
CREATE UNIQUE INDEX "DomainEvent_organizationId_id_key" ON "DomainEvent" ("organizationId", "id");
CREATE UNIQUE INDEX "SimulationRun_organizationId_id_key" ON "SimulationRun" ("organizationId", "id");

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

CREATE OR REPLACE FUNCTION enforce_simulation_agent_tenant() RETURNS trigger AS $$
DECLARE
  run_organization uuid;
  driver_organization uuid;
  delivery_organization uuid;
BEGIN
  SELECT "organizationId" INTO run_organization FROM "SimulationRun" WHERE id = NEW."simulationRunId";
  SELECT "organizationId" INTO driver_organization FROM "Driver" WHERE id = NEW."driverId";
  IF run_organization IS DISTINCT FROM driver_organization THEN
    RAISE EXCEPTION 'SimulationAgent driver must belong to the simulation organisation';
  END IF;
  IF NEW."currentDeliveryId" IS NOT NULL THEN
    SELECT "organizationId" INTO delivery_organization FROM "Delivery" WHERE id = NEW."currentDeliveryId";
    IF run_organization IS DISTINCT FROM delivery_organization THEN
      RAISE EXCEPTION 'SimulationAgent delivery must belong to the simulation organisation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SimulationAgent_tenant_guard"
  BEFORE INSERT OR UPDATE ON "SimulationAgent"
  FOR EACH ROW EXECUTE FUNCTION enforce_simulation_agent_tenant();
