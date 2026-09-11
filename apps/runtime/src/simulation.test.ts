import { describe, expect, it } from "vitest";
import {
  advanceLogicalTime,
  createSimulationAgents,
  shouldCompleteSimulation,
  simulationJourneyPoint,
} from "./simulation";

describe("simulation", () => {
  const config = {
    scenario: "DISRUPTION" as const,
    driverCount: 25 as const,
    speed: 5 as const,
    seed: 812_764,
  };

  it("creates deterministic agents", () => {
    expect(createSimulationAgents(config)).toEqual(
      createSimulationAgents(config),
    );
  });

  it("pins a stable deterministic fixture", () => {
    expect(createSimulationAgents(config).slice(0, 3)).toMatchInlineSnapshot(`
      [
        {
          "exception": "OFFLINE",
          "index": 0,
          "speedMps": 4.957,
          "startDelaySeconds": 65,
        },
        {
          "exception": "NONE",
          "index": 1,
          "speedMps": 5.796,
          "startDelaySeconds": 89,
        },
        {
          "exception": "NONE",
          "index": 2,
          "speedMps": 7.223,
          "startDelaySeconds": 144,
        },
      ]
    `);
  });

  it.each([5, 25, 100] as const)(
    "is deterministic at %s-driver scale",
    (driverCount) => {
      const scaled = { ...config, driverCount };
      expect(createSimulationAgents(scaled)).toEqual(
        createSimulationAgents(scaled),
      );
    },
  );

  it("creates the requested fleet size", () => {
    expect(createSimulationAgents(config)).toHaveLength(25);
  });

  it("separates logical and wall time", () => {
    expect(advanceLogicalTime(10_000, 2_000, 5)).toBe(20_000);
  });

  it("keeps the 100-driver acceptance run alive for ten logical minutes", () => {
    expect(shouldCompleteSimulation(100, 100, 100, 599_999)).toBe(false);
    expect(shouldCompleteSimulation(100, 100, 100, 600_000)).toBe(true);
    expect(shouldCompleteSimulation(5, 5, 5, 50_000)).toBe(true);
  });

  it("sends vans from depot to drop-off and back home", () => {
    const pickup = { latitude: 51.5416, longitude: -0.0015 };
    const dropoff = { latitude: 51.5118, longitude: -0.124 };
    const outbound = simulationJourneyPoint({
      phase: "EN_ROUTE_TO_DROPOFF",
      deliveryStatus: "EN_ROUTE_TO_DROPOFF",
      pickup,
      dropoff,
      sequence: 6,
      returnTicks: 0,
      deviation: 0,
    });
    expect(outbound.coordinate.longitude).toBeLessThan(pickup.longitude);
    expect(outbound.headingDegrees).toBeGreaterThan(220);
    const home = simulationJourneyPoint({
      phase: "RETURNING",
      deliveryStatus: "DELIVERED",
      pickup,
      dropoff,
      sequence: 20,
      returnTicks: 8,
      deviation: 0,
    });
    expect(home.returnComplete).toBe(true);
    expect(home.coordinate.latitude).toBeCloseTo(pickup.latitude, 5);
    expect(home.headingDegrees).toBeLessThan(100);
  });
});
