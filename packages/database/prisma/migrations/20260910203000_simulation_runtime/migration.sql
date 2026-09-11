ALTER TABLE "SimulationRun" ADD COLUMN "driverCount" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "SimulationAgent" ADD COLUMN "telemetrySequence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SimulationRun" ADD CONSTRAINT "simulation_driver_count_valid" CHECK ("driverCount" IN (5, 25, 100));
ALTER TABLE "SimulationRun" ADD CONSTRAINT "simulation_speed_valid" CHECK ("speed" IN (1, 2, 5, 10));
ALTER TABLE "SimulationRun" ADD CONSTRAINT "simulation_seed_uint32" CHECK (seed BETWEEN 0 AND 4294967295);
