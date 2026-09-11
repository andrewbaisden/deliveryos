export type DeliveryRisk = "ON_TIME" | "AT_RISK" | "DELAYED";
export type LocationFreshness = "LIVE" | "RECENT" | "STALE" | "OFFLINE";

export function classifyRisk(
  eta: Date,
  promisedAt: Date,
  deliveredAt?: Date | null,
): DeliveryRisk {
  const effective = deliveredAt ?? eta;
  const deltaMs = promisedAt.getTime() - effective.getTime();
  if (deltaMs < 0) return "DELAYED";
  if (deltaMs <= 10 * 60_000) return "AT_RISK";
  return "ON_TIME";
}

export function classifyFreshness(
  observedAt: Date,
  now: Date,
): LocationFreshness {
  const ageSeconds = Math.max(0, (now.getTime() - observedAt.getTime()) / 1000);
  if (ageSeconds <= 15) return "LIVE";
  if (ageSeconds <= 60) return "RECENT";
  if (ageSeconds <= 180) return "STALE";
  return "OFFLINE";
}

export function customerEtaWindow(eta: Date): { from: Date; to: Date } {
  const rounded = Math.round(eta.getTime() / 300_000) * 300_000;
  return { from: new Date(rounded - 300_000), to: new Date(rounded + 300_000) };
}

export function createPrng(seed: number): () => number {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export type Coordinate = { latitude: number; longitude: number };

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

export function interpolateCoordinate(
  from: Coordinate,
  to: Coordinate,
  t: number,
): Coordinate {
  const progress = Math.min(1, Math.max(0, t));
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * progress,
    longitude: from.longitude + (to.longitude - from.longitude) * progress,
  };
}

export function headingDegrees(from: Coordinate, to: Coordinate): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLon = radians(to.longitude - from.longitude);
  const lat1 = radians(from.latitude);
  const lat2 = radians(to.latitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

export function inferDriverRouteLocation(input: {
  status: string;
  pickup: Coordinate;
  dropoff: Coordinate;
}): Coordinate & { headingDegrees: number } {
  if (TOWARD_PICKUP.has(input.status)) {
    return {
      ...input.pickup,
      headingDegrees: headingDegrees(input.pickup, input.dropoff),
    };
  }
  if (TOWARD_DROPOFF.has(input.status)) {
    const progress =
      input.status === "PICKED_UP"
        ? 0.2
        : input.status === "ARRIVED_DROPOFF"
          ? 1
          : 0.65;
    const location = interpolateCoordinate(
      input.pickup,
      input.dropoff,
      progress,
    );
    return {
      ...location,
      headingDegrees: headingDegrees(input.pickup, input.dropoff),
    };
  }
  return {
    ...input.pickup,
    headingDegrees: headingDegrees(input.dropoff, input.pickup),
  };
}

export function distanceMetres(from: Coordinate, to: Coordinate): number {
  const radius = 6_371_000;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type GeofenceState = {
  insideSamples: number;
  outsideSamples: number;
  entered: boolean;
  firstInsideAt: Date | null;
};

export function evaluateGeofence(
  state: GeofenceState,
  distanceM: number,
  observedAt: Date,
  radiusM = 75,
): { state: GeofenceState; event: "ENTERED" | "EXITED" | null } {
  if (distanceM <= radiusM) {
    const insideSamples = state.insideSamples + 1;
    const firstInsideAt = state.firstInsideAt ?? observedAt;
    const confirmed =
      insideSamples >= 2 &&
      observedAt.getTime() - firstInsideAt.getTime() >= 5_000;
    return {
      state: {
        insideSamples,
        outsideSamples: 0,
        firstInsideAt,
        entered: state.entered || confirmed,
      },
      event: confirmed && !state.entered ? "ENTERED" : null,
    };
  }
  if (distanceM >= radiusM + 25) {
    const outsideSamples = state.outsideSamples + 1;
    const exited = state.entered && outsideSamples >= 2;
    return {
      state: {
        insideSamples: 0,
        outsideSamples,
        firstInsideAt: null,
        entered: exited ? false : state.entered,
      },
      event: exited ? "EXITED" : null,
    };
  }
  return {
    state: {
      ...state,
      insideSamples: 0,
      outsideSamples: 0,
      firstInsideAt: null,
    },
    event: null,
  };
}

export function calculateProgressEta(input: {
  now: Date;
  routeDurationSeconds: number;
  routeDistanceM: number;
  remainingDistanceM: number;
  additionalServiceSeconds?: number;
}): Date {
  const ratio =
    input.routeDistanceM <= 0
      ? 0
      : Math.min(
          1,
          Math.max(0, input.remainingDistanceM / input.routeDistanceM),
        );
  const seconds =
    input.routeDurationSeconds * ratio + (input.additionalServiceSeconds ?? 0);
  return new Date(input.now.getTime() + seconds * 1_000);
}

export type DeviationState = {
  outsideSamples: number;
  insideSamples: number;
  firstOutsideAt: Date | null;
  deviating: boolean;
};

export function evaluateDeviation(
  state: DeviationState,
  distanceFromRouteM: number,
  accuracyM: number,
  observedAt: Date,
) {
  if (accuracyM > 100)
    return { state, event: null as "DETECTED" | "CLEARED" | null };
  if (distanceFromRouteM > 150) {
    const outsideSamples = state.outsideSamples + 1;
    const firstOutsideAt = state.firstOutsideAt ?? observedAt;
    const detected =
      outsideSamples >= 3 &&
      observedAt.getTime() - firstOutsideAt.getTime() >= 30_000;
    return {
      state: {
        outsideSamples,
        insideSamples: 0,
        firstOutsideAt,
        deviating: state.deviating || detected,
      },
      event: detected && !state.deviating ? ("DETECTED" as const) : null,
    };
  }
  if (distanceFromRouteM < 100) {
    const insideSamples = state.insideSamples + 1;
    const cleared = state.deviating && insideSamples >= 3;
    return {
      state: {
        outsideSamples: 0,
        insideSamples,
        firstOutsideAt: null,
        deviating: cleared ? false : state.deviating,
      },
      event: cleared ? ("CLEARED" as const) : null,
    };
  }
  return {
    state: {
      ...state,
      outsideSamples: 0,
      insideSamples: 0,
      firstOutsideAt: null,
    },
    event: null,
  };
}
