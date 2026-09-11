import type { SimulationConfig } from "@deliveryos/contracts";
import { createPrng } from "@deliveryos/domain";

export const scenarioPresets = {
  NORMAL_SHIFT: {
    deliveriesPerDriver: 3,
    disruptionRate: 0.02,
    trafficFactor: 1,
  },
  PEAK_PERIOD: {
    deliveriesPerDriver: 4,
    disruptionRate: 0.04,
    trafficFactor: 0.72,
  },
  DISRUPTION: {
    deliveriesPerDriver: 3,
    disruptionRate: 0.18,
    trafficFactor: 0.65,
  },
  LATE_SHIFT: {
    deliveriesPerDriver: 2,
    disruptionRate: 0.08,
    trafficFactor: 0.78,
  },
} as const;

export type SimulatedAgent = {
  index: number;
  speedMps: number;
  startDelaySeconds: number;
  exception: "NONE" | "TRAFFIC" | "DEVIATION" | "OFFLINE" | "FAILED_DELIVERY";
};

export function createSimulationAgents(
  config: SimulationConfig,
): SimulatedAgent[] {
  const random = createPrng(config.seed);
  const preset = scenarioPresets[config.scenario];
  const exceptionTypes = [
    "TRAFFIC",
    "DEVIATION",
    "OFFLINE",
    "FAILED_DELIVERY",
  ] as const;

  return Array.from({ length: config.driverCount }, (_, index) => {
    const disrupted = random() < preset.disruptionRate;
    return {
      index,
      speedMps: Number(((7 + random() * 5) * preset.trafficFactor).toFixed(3)),
      startDelaySeconds: Math.floor(random() * 180),
      exception: disrupted
        ? (exceptionTypes[Math.floor(random() * exceptionTypes.length)] ??
          "TRAFFIC")
        : "NONE",
    };
  });
}

export function advanceLogicalTime(
  currentMs: number,
  elapsedWallMs: number,
  speed: 1 | 2 | 5 | 10,
): number {
  return currentMs + elapsedWallMs * speed;
}

export function shouldCompleteSimulation(
  completedAgents: number,
  totalAgents: number,
  driverCount: number,
  logicalTimeMs: number,
) {
  if (totalAgents === 0 || completedAgents !== totalAgents) return false;
  return driverCount !== 100 || logicalTimeMs >= 10 * 60_000;
}
