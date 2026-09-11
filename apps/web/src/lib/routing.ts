import type { CalculatedRoute } from "@deliveryos/providers";
import { createGeocodingProvider, createRoutingProvider } from "./providers";

type RouteWriter = {
  route: {
    updateMany: (args: {
      where: {
        deliveryId: string;
        legType: "TO_PICKUP" | "TO_DROPOFF";
        isActive: boolean;
      };
      data: { isActive: boolean };
    }) => Promise<unknown>;
    findMany: (args: {
      where: { deliveryId: string; legType: "TO_PICKUP" | "TO_DROPOFF" };
      select: { version: true };
      orderBy: { version: "desc" };
      take: number;
    }) => Promise<Array<{ version: number }>>;
    create: (args: {
      data: {
        organizationId: string;
        deliveryId: string;
        legType: "TO_PICKUP" | "TO_DROPOFF";
        version: number;
        provider: string;
        profile: string;
        status: "READY";
        origin: { latitude: number; longitude: number };
        destination: { latitude: number; longitude: number };
        geometry: CalculatedRoute["geometry"];
        distanceM: number;
        durationSeconds: number;
        calculationReason: string;
        isActive: boolean;
        calculatedAt: Date;
      };
    }) => Promise<unknown>;
  };
};

export async function resolveStopPlace(input: {
  addressLine1: string;
  postalCode: string;
  city: string;
}) {
  const geocoder = createGeocodingProvider();
  const query = `${input.addressLine1}, ${input.postalCode}, ${input.city}`;
  const [candidate] = await geocoder.search({
    query,
    country: "GB",
    proximity: { latitude: 51.5074, longitude: -0.1278 },
  });
  if (!candidate)
    throw new Error(`Could not geocode address: ${input.addressLine1}`);
  const place = await geocoder.resolve(candidate);
  return {
    addressLine1: place.addressLine1 || input.addressLine1,
    city: place.city || input.city,
    postalCode: place.postalCode || input.postalCode,
    latitude: place.coordinate.latitude,
    longitude: place.coordinate.longitude,
  };
}

export async function calculateLeg(input: {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  profile?: "driving" | "driving-traffic" | "cycling";
}): Promise<CalculatedRoute> {
  const router = createRoutingProvider();
  return router.calculate({
    profile: input.profile ?? "driving-traffic",
    coordinates: [input.origin, input.destination],
  });
}

export async function persistActiveRoute(
  transaction: RouteWriter,
  input: {
    organizationId: string;
    deliveryId: string;
    legType: "TO_PICKUP" | "TO_DROPOFF";
    origin: { latitude: number; longitude: number };
    destination: { latitude: number; longitude: number };
    route: CalculatedRoute;
    reason: string;
  },
) {
  await transaction.route.updateMany({
    where: {
      deliveryId: input.deliveryId,
      legType: input.legType,
      isActive: true,
    },
    data: { isActive: false },
  });
  const versions = await transaction.route.findMany({
    where: { deliveryId: input.deliveryId, legType: input.legType },
    select: { version: true },
    orderBy: { version: "desc" },
    take: 1,
  });
  return transaction.route.create({
    data: {
      organizationId: input.organizationId,
      deliveryId: input.deliveryId,
      legType: input.legType,
      version: (versions[0]?.version ?? 0) + 1,
      provider: input.route.provider,
      profile: input.route.profile,
      status: "READY",
      origin: input.origin,
      destination: input.destination,
      geometry: input.route.geometry,
      distanceM: input.route.distanceM,
      durationSeconds: input.route.durationSeconds,
      calculationReason: input.reason,
      isActive: true,
      calculatedAt: new Date(),
    },
  });
}

export function etaFromDurations(input: {
  toPickupSeconds: number;
  toDropoffSeconds: number;
  pickupServiceSeconds?: number;
  from?: Date;
}) {
  const from = input.from ?? new Date();
  const totalSeconds =
    input.toPickupSeconds +
    (input.pickupServiceSeconds ?? 300) +
    input.toDropoffSeconds;
  return new Date(from.getTime() + totalSeconds * 1_000);
}
