import {
  type Coordinate,
  createPrng,
  headingDegrees,
  interpolateCoordinate,
} from "@deliveryos/domain";
import { simulationStartFromPickup } from "./simulation";

export const DEMO_TICK_MS = 2_000;
export const DEMO_CYCLE_MS = 120_000;

export const DEMO_DEPOT: Coordinate = {
  latitude: 51.5416,
  longitude: -0.0015,
};

export const DEMO_DROPOFF: Coordinate = {
  latitude: 51.5118,
  longitude: -0.124,
};

const TOWARD_PICKUP = new Set([
  "ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED_PICKUP",
]);
const TOWARD_DROPOFF = new Set([
  "PICKED_UP",
  "EN_ROUTE_TO_DROPOFF",
  "ARRIVED_DROPOFF",
]);

export function demoTickerEnabled(env: {
  NODE_ENV?: string | undefined;
  DEMO_FLEET_TICKER?: string | undefined;
}): boolean {
  if (env.DEMO_FLEET_TICKER === "false") return false;
  if (env.DEMO_FLEET_TICKER === "true") return true;
  return (env.NODE_ENV ?? "development") !== "production";
}

export function shouldTickDriver(driver: {
  status: string;
  simulationRunStatus: string | null;
}): boolean {
  if (driver.status === "OFFLINE") return false;
  return (
    driver.simulationRunStatus !== "RUNNING" &&
    driver.simulationRunStatus !== "PAUSED"
  );
}

export function seedFromUuid(id: string): number {
  let hash = 2166136261;
  for (const character of id) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function triangleProgress(cycleT: number): number {
  const t = cycleT - Math.floor(cycleT);
  return t < 0.5 ? t * 2 : (1 - t) * 2;
}

export function demoTickerPoint(input: {
  nowMs: number;
  driverId: string;
  deliveryStatus: string | null;
  pickup: Coordinate;
  dropoff: Coordinate;
}): {
  latitude: number;
  longitude: number;
  headingDegrees: number;
  speedMps: number;
} {
  const random = createPrng(seedFromUuid(input.driverId));
  const phase = random();
  const cycleT = input.nowMs / DEMO_CYCLE_MS + phase;
  const wrapped = cycleT - Math.floor(cycleT);
  const outbound = wrapped < 0.5;
  const progress = triangleProgress(cycleT);

  if (
    input.deliveryStatus &&
    (TOWARD_PICKUP.has(input.deliveryStatus) ||
      TOWARD_DROPOFF.has(input.deliveryStatus))
  ) {
    const from = TOWARD_DROPOFF.has(input.deliveryStatus)
      ? input.pickup
      : simulationStartFromPickup(input.pickup);
    const to = TOWARD_DROPOFF.has(input.deliveryStatus)
      ? input.dropoff
      : input.pickup;
    const location = interpolateCoordinate(from, to, progress);
    return {
      ...location,
      headingDegrees: outbound
        ? headingDegrees(from, to)
        : headingDegrees(to, from),
      speedMps: 8,
    };
  }

  const parkAngle = random() * Math.PI * 2;
  const parkRadius = 0.0018 + random() * 0.0032;
  const orbit = input.nowMs / 40_000 + parkAngle;
  const radius = parkRadius * (0.7 + 0.3 * Math.sin(orbit));
  const latitude = DEMO_DEPOT.latitude + Math.sin(orbit) * radius;
  const longitude = DEMO_DEPOT.longitude + Math.cos(orbit) * radius * 1.6;
  const ahead = {
    latitude: DEMO_DEPOT.latitude + Math.sin(orbit + 0.25) * radius,
    longitude: DEMO_DEPOT.longitude + Math.cos(orbit + 0.25) * radius * 1.6,
  };
  return {
    latitude,
    longitude,
    headingDegrees: headingDegrees({ latitude, longitude }, ahead),
    speedMps: 3.5,
  };
}
