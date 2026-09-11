import { database } from "@deliveryos/database/client";
import {
  calculateProgressEta,
  classifyFreshness,
  classifyRisk,
  distanceMetres,
  evaluateDeviation,
  evaluateGeofence,
  type GeofenceState,
} from "@deliveryos/domain";
import { z } from "zod";
import type { TelemetryJob } from "./queues";
import type { createRedis } from "./redis";

type Redis = ReturnType<typeof createRedis>;
const activeStatuses = [
  "ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED_PICKUP",
  "PICKED_UP",
  "EN_ROUTE_TO_DROPOFF",
  "ARRIVED_DROPOFF",
] as const;
const lineStringSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
});

async function appendEvent(input: {
  organizationId: string;
  deliveryId?: string;
  driverId?: string;
  aggregateType: "DELIVERY" | "DRIVER" | "ALERT";
  aggregateId: string;
  eventType: string;
  metadata?: Record<string, string | number | boolean>;
}) {
  if (!database) return;
  await database.$transaction(async (transaction) => {
    const event = await transaction.domainEvent.create({
      data: {
        organizationId: input.organizationId,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        ...(input.deliveryId ? { deliveryId: input.deliveryId } : {}),
        ...(input.driverId ? { driverId: input.driverId } : {}),
        eventType: input.eventType,
        actorType: "SYSTEM",
        metadata: input.metadata ?? {},
      },
    });
    await transaction.outboxEvent.create({
      data: {
        organizationId: input.organizationId,
        domainEventId: event.id,
      },
    });
  });
}

function parseGeofenceState(value: string | null): GeofenceState {
  if (!value)
    return {
      insideSamples: 0,
      outsideSamples: 0,
      entered: false,
      firstInsideAt: null,
    };
  const parsed = z
    .object({
      insideSamples: z.number().int().nonnegative(),
      outsideSamples: z.number().int().nonnegative(),
      entered: z.boolean(),
      firstInsideAt: z.string().datetime().nullable(),
    })
    .safeParse(JSON.parse(value));
  if (!parsed.success) return parseGeofenceState(null);
  return {
    ...parsed.data,
    firstInsideAt: parsed.data.firstInsideAt
      ? new Date(parsed.data.firstInsideAt)
      : null,
  };
}

function distanceToSegmentMetres(
  point: { latitude: number; longitude: number },
  start: [number, number],
  end: [number, number],
) {
  const latitudeScale = 110_540;
  const longitudeScale = 111_320 * Math.cos((point.latitude * Math.PI) / 180);
  const px = point.longitude * longitudeScale;
  const py = point.latitude * latitudeScale;
  const ax = start[0] * longitudeScale;
  const ay = start[1] * latitudeScale;
  const bx = end[0] * longitudeScale;
  const by = end[1] * latitudeScale;
  const dx = bx - ax;
  const dy = by - ay;
  const denominator = dx * dx + dy * dy;
  const ratio =
    denominator === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denominator),
        );
  return Math.hypot(px - (ax + ratio * dx), py - (ay + ratio * dy));
}

function distanceToRouteMetres(
  point: { latitude: number; longitude: number },
  coordinates: Array<[number, number]>,
) {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    if (start && end)
      minimum = Math.min(minimum, distanceToSegmentMetres(point, start, end));
  }
  return minimum;
}

async function updateAlert(input: {
  organizationId: string;
  deliveryId?: string;
  driverId?: string;
  type:
    | "DELIVERY_AT_RISK"
    | "DELIVERY_DELAYED"
    | "DRIVER_STALE"
    | "DRIVER_OFFLINE"
    | "ROUTE_DEVIATION";
  severity: "WARNING" | "CRITICAL";
  message: string;
  open: boolean;
}) {
  if (!database) return;
  const entityScope = {
    ...(input.deliveryId ? { deliveryId: input.deliveryId } : {}),
    ...(input.driverId ? { driverId: input.driverId } : {}),
  };
  const existing = await database.operationalAlert.findFirst({
    where: {
      organizationId: input.organizationId,
      ...entityScope,
      type: input.type,
      status: { in: ["OPEN", "ACKNOWLEDGED"] },
    },
    orderBy: { openedAt: "desc" },
  });
  if (!input.open) {
    if (existing)
      await database.operationalAlert.update({
        where: { id: existing.id },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      });
    return;
  }
  if (existing) return;
  const coolingDown = await database.operationalAlert.findFirst({
    where: {
      organizationId: input.organizationId,
      ...entityScope,
      type: input.type,
      cooldownUntil: { gt: new Date() },
    },
  });
  if (coolingDown) return;
  const alert = await database.operationalAlert.create({
    data: {
      organizationId: input.organizationId,
      ...entityScope,
      type: input.type,
      severity: input.severity,
      message: input.message,
      cooldownUntil: new Date(Date.now() + 10 * 60_000),
    },
  });
  await appendEvent({
    organizationId: input.organizationId,
    ...entityScope,
    aggregateType: "ALERT",
    aggregateId: alert.id,
    eventType: "alert.opened",
    metadata: { alertType: input.type, severity: input.severity },
  });
}

export async function evaluateOperationalTelemetry(
  redis: Redis,
  telemetry: TelemetryJob,
) {
  if (!database) return;
  const delivery = await database.delivery.findFirst({
    where: {
      organizationId: telemetry.organizationId,
      assignedDriverId: telemetry.driverId,
      status: { in: [...activeStatuses] },
    },
    include: {
      stops: { orderBy: { sequence: "asc" } },
      routes: {
        where: { isActive: true, status: "READY" },
        orderBy: { calculatedAt: "desc" },
      },
    },
    orderBy: { promisedDeliveryAt: "asc" },
  });
  if (!delivery) return;
  const goingToDropoff = [
    "PICKED_UP",
    "EN_ROUTE_TO_DROPOFF",
    "ARRIVED_DROPOFF",
  ].includes(delivery.status);
  const stopKind = goingToDropoff ? "DROPOFF" : "PICKUP";
  const stop = delivery.stops.find(({ kind }) => kind === stopKind);
  if (!stop) return;
  const observedAt = new Date(telemetry.observedAt);
  const point = {
    latitude: telemetry.latitude,
    longitude: telemetry.longitude,
  };
  const stopPoint = {
    latitude: Number(stop.latitude),
    longitude: Number(stop.longitude),
  };

  const geofenceKey = `deliveryos:operations:geofence:${delivery.id}:${stopKind}`;
  const geofence = evaluateGeofence(
    parseGeofenceState(await redis.get(geofenceKey)),
    distanceMetres(point, stopPoint),
    observedAt,
    stop.geofenceRadiusM,
  );
  await redis.set(
    geofenceKey,
    JSON.stringify({
      ...geofence.state,
      firstInsideAt: geofence.state.firstInsideAt?.toISOString() ?? null,
    }),
    "EX",
    86_400,
  );
  if (geofence.event === "ENTERED")
    await appendEvent({
      organizationId: telemetry.organizationId,
      deliveryId: delivery.id,
      driverId: telemetry.driverId,
      aggregateType: "DELIVERY",
      aggregateId: delivery.id,
      eventType: `${stopKind.toLowerCase()}.geofence_entered`,
      metadata: { stopId: stop.id, radiusM: stop.geofenceRadiusM },
    });

  const legType = goingToDropoff ? "TO_DROPOFF" : "TO_PICKUP";
  const route = delivery.routes.find(({ legType: type }) => type === legType);
  if (!route) return;
  const geometry = lineStringSchema.safeParse(route.geometry);
  if (geometry.success) {
    const deviationKey = `deliveryos:operations:deviation:${delivery.id}:${legType}`;
    const deviationState = z
      .object({
        outsideSamples: z.number().int().nonnegative(),
        insideSamples: z.number().int().nonnegative(),
        firstOutsideAt: z.string().datetime().nullable(),
        deviating: z.boolean(),
      })
      .safeParse(JSON.parse((await redis.get(deviationKey)) ?? "null"));
    const previous = deviationState.success
      ? {
          ...deviationState.data,
          firstOutsideAt: deviationState.data.firstOutsideAt
            ? new Date(deviationState.data.firstOutsideAt)
            : null,
        }
      : {
          outsideSamples: 0,
          insideSamples: 0,
          firstOutsideAt: null,
          deviating: false,
        };
    const deviation = evaluateDeviation(
      previous,
      distanceToRouteMetres(point, geometry.data.coordinates),
      telemetry.accuracyM ?? 0,
      observedAt,
    );
    await redis.set(
      deviationKey,
      JSON.stringify({
        ...deviation.state,
        firstOutsideAt: deviation.state.firstOutsideAt?.toISOString() ?? null,
      }),
      "EX",
      86_400,
    );
    if (deviation.event) {
      await appendEvent({
        organizationId: telemetry.organizationId,
        deliveryId: delivery.id,
        driverId: telemetry.driverId,
        aggregateType: "DELIVERY",
        aggregateId: delivery.id,
        eventType:
          deviation.event === "DETECTED"
            ? "route.deviation_detected"
            : "route.deviation_cleared",
      });
      await updateAlert({
        organizationId: telemetry.organizationId,
        deliveryId: delivery.id,
        driverId: telemetry.driverId,
        type: "ROUTE_DEVIATION",
        severity: "WARNING",
        message: "Driver is outside the active route corridor",
        open: deviation.event === "DETECTED",
      });
    }
  }

  const etaLock = `deliveryos:operations:eta:${delivery.id}`;
  if (!(await redis.set(etaLock, telemetry.eventId, "EX", 30, "NX"))) return;
  if (!route.distanceM || !route.durationSeconds) return;
  const currentLegEta = calculateProgressEta({
    now: observedAt,
    routeDurationSeconds: route.durationSeconds,
    routeDistanceM: route.distanceM,
    remainingDistanceM: Math.min(
      route.distanceM,
      distanceMetres(point, stopPoint),
    ),
    additionalServiceSeconds: goingToDropoff ? 0 : 300,
  });
  const onwardSeconds = goingToDropoff
    ? 0
    : (delivery.routes.find(({ legType: type }) => type === "TO_DROPOFF")
        ?.durationSeconds ?? 0);
  const eta = new Date(currentLegEta.getTime() + onwardSeconds * 1_000);
  const risk = classifyRisk(eta, delivery.promisedDeliveryAt);
  const etaChanged =
    !delivery.currentEtaAt ||
    Math.abs(eta.getTime() - delivery.currentEtaAt.getTime()) >= 120_000;
  const riskChanged = risk !== delivery.risk;
  if (!etaChanged && !riskChanged) return;
  await database.$transaction(async (transaction) => {
    await transaction.delivery.update({
      where: { id: delivery.id },
      data: {
        ...(etaChanged ? { currentEtaAt: eta } : {}),
        ...(riskChanged ? { risk } : {}),
      },
    });
    for (const eventType of [
      ...(etaChanged ? ["eta.changed"] : []),
      ...(riskChanged ? ["delivery.risk_changed"] : []),
    ]) {
      const event = await transaction.domainEvent.create({
        data: {
          organizationId: telemetry.organizationId,
          aggregateType: "DELIVERY",
          aggregateId: delivery.id,
          deliveryId: delivery.id,
          driverId: telemetry.driverId,
          eventType,
          actorType: "SYSTEM",
          metadata:
            eventType === "eta.changed"
              ? { etaAt: eta.toISOString() }
              : { from: delivery.risk, to: risk },
        },
      });
      await transaction.outboxEvent.create({
        data: {
          organizationId: telemetry.organizationId,
          domainEventId: event.id,
        },
      });
    }
  });
  await updateAlert({
    organizationId: telemetry.organizationId,
    deliveryId: delivery.id,
    driverId: telemetry.driverId,
    type: risk === "DELAYED" ? "DELIVERY_DELAYED" : "DELIVERY_AT_RISK",
    severity: risk === "DELAYED" ? "CRITICAL" : "WARNING",
    message:
      risk === "DELAYED"
        ? "Current ETA is beyond the promised time"
        : "Current ETA is within ten minutes of the promised time",
    open: risk !== "ON_TIME",
  });
  if (risk === "ON_TIME") {
    await updateAlert({
      organizationId: telemetry.organizationId,
      deliveryId: delivery.id,
      driverId: telemetry.driverId,
      type: "DELIVERY_AT_RISK",
      severity: "WARNING",
      message: "Delivery returned to an on-time estimate",
      open: false,
    });
    await updateAlert({
      organizationId: telemetry.organizationId,
      deliveryId: delivery.id,
      driverId: telemetry.driverId,
      type: "DELIVERY_DELAYED",
      severity: "CRITICAL",
      message: "Delivery returned to an on-time estimate",
      open: false,
    });
  }
}

export async function evaluateDriverPresence(redis: Redis) {
  if (!database) return;
  const drivers = await database.driver.findMany({
    where: { status: { not: "OFFLINE" } },
    select: { id: true, organizationId: true },
  });
  for (const driver of drivers) {
    const location = await redis.hgetall(
      `deliveryos:org:${driver.organizationId}:driver:${driver.id}:location`,
    );
    const freshness = location.observedAt
      ? classifyFreshness(new Date(location.observedAt), new Date())
      : "OFFLINE";
    for (const type of ["DRIVER_STALE", "DRIVER_OFFLINE"] as const) {
      const open =
        (type === "DRIVER_STALE" && freshness === "STALE") ||
        (type === "DRIVER_OFFLINE" && freshness === "OFFLINE");
      await updateAlert({
        organizationId: driver.organizationId,
        driverId: driver.id,
        type,
        severity: type === "DRIVER_OFFLINE" ? "CRITICAL" : "WARNING",
        message:
          type === "DRIVER_OFFLINE"
            ? "Driver telemetry has been offline for over three minutes"
            : "Driver telemetry is stale",
        open,
      });
    }
  }
}
