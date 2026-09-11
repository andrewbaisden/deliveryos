import type { SimulationConfig } from "@deliveryos/contracts";
import {
  type Coordinate,
  createPrng,
  distanceMetres,
  headingDegrees,
  interpolateCoordinate,
} from "@deliveryos/domain";
import { z } from "zod";

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

export const SIMULATION_RETURN_TICKS = 8;

export const simulationFlagsSchema = z.object({
  exception: z
    .enum(["NONE", "TRAFFIC", "DEVIATION", "OFFLINE", "FAILED_DELIVERY"])
    .optional(),
  speedMps: z.number().optional(),
  returnTicks: z.number().int().nonnegative().optional(),
});

export function simulationStartFromPickup(pickup: Coordinate): Coordinate {
  return {
    latitude: pickup.latitude + 0.008,
    longitude: pickup.longitude - 0.01,
  };
}

export function simulationJourneyPoint(input: {
  phase: string;
  deliveryStatus: string;
  pickup: Coordinate;
  dropoff: Coordinate;
  sequence: number;
  returnTicks: number;
  deviation: number;
}): {
  coordinate: Coordinate;
  headingDegrees: number;
  returnComplete: boolean;
  routePositionM: number;
} {
  if (input.phase === "RETURNING" || input.deliveryStatus === "DELIVERED") {
    const progress = Math.min(1, input.returnTicks / SIMULATION_RETURN_TICKS);
    const coordinate = interpolateCoordinate(
      input.dropoff,
      input.pickup,
      progress,
    );
    return {
      coordinate,
      headingDegrees: headingDegrees(input.dropoff, input.pickup),
      returnComplete: progress >= 1,
      routePositionM: distanceMetres(input.dropoff, coordinate),
    };
  }
  const towardDropoff = [
    "PICKED_UP",
    "EN_ROUTE_TO_DROPOFF",
    "ARRIVED_DROPOFF",
  ].includes(input.deliveryStatus);
  const from = towardDropoff
    ? input.pickup
    : simulationStartFromPickup(input.pickup);
  const to = towardDropoff ? input.dropoff : input.pickup;
  const durationTicks = towardDropoff ? 12 : 6;
  const progress = Math.min(1, input.sequence / durationTicks);
  const traveled = interpolateCoordinate(from, to, progress);
  const coordinate = {
    latitude: traveled.latitude + input.deviation,
    longitude: traveled.longitude,
  };
  return {
    coordinate,
    headingDegrees: headingDegrees(from, to),
    returnComplete: false,
    routePositionM: distanceMetres(from, coordinate),
  };
}
