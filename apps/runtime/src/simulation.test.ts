import { describe, expect, it } from "vitest";
import {
  advanceLogicalTime,
  createSimulationAgents,
  shouldCompleteSimulation,
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
});
