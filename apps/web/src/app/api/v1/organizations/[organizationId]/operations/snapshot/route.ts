import {
  classifyFreshness,
  inferDriverRouteLocation,
} from "@deliveryos/domain";
import { apiError, requireMembership } from "@/lib/api";
import { PLAYFIELD_LANDMARKS } from "@/lib/playfield";
import { ensureRedis } from "@/lib/redis";

function asCoordinate(value: { latitude: unknown; longitude: unknown }) {
  return {
    latitude: Number(value.latitude),
    longitude: Number(value.longitude),
  };
}

function headingTowardDropoff() {
  return inferDriverRouteLocation({
    status: "ASSIGNED",
    pickup: PLAYFIELD_LANDMARKS.depot,
    dropoff: PLAYFIELD_LANDMARKS.dropoff,
  }).headingDegrees;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { organizationId } = await params;
    const { database } = await requireMembership(
      request.headers,
      organizationId,
      ["ADMIN", "DISPATCHER"],
    );
    const [organization, deliveries, drivers, alerts, zones] =
      await Promise.all([
        database.organization.findUniqueOrThrow({
          where: { id: organizationId },
          select: { id: true, name: true, slug: true, timeZone: true },
        }),
        database.delivery.findMany({
          where: {
            organizationId,
            status: {
              notIn: ["DELIVERED", "FAILED", "CANCELLED", "RETURN_REQUIRED"],
            },
          },
          include: {
            customer: { select: { id: true, name: true } },
            assignedDriver: { select: { id: true, name: true } },
            stops: { orderBy: { sequence: "asc" } },
          },
          orderBy: [{ risk: "desc" }, { promisedDeliveryAt: "asc" }],
        }),
        database.driver.findMany({
          where: { organizationId },
          include: {
            vehicle: true,
            zone: { select: { id: true, name: true } },
          },
          orderBy: { name: "asc" },
        }),
        database.operationalAlert.findMany({
          where: { organizationId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
          orderBy: [{ severity: "desc" }, { openedAt: "desc" }],
        }),
        database.zone.findMany({
          where: { organizationId },
          select: { id: true, name: true, boundary: true },
          orderBy: { name: "asc" },
        }),
      ]);

    let redis: Awaited<ReturnType<typeof ensureRedis>> | undefined;
    let workerHeartbeat: string | null = null;
    try {
      redis = await ensureRedis();
      workerHeartbeat = await redis.get("deliveryos:worker:heartbeat");
    } catch {
      // PostgreSQL snapshots keep this query useful during a Redis outage.
    }

    const now = new Date();
    const assignmentByDriver = new Map(
      deliveries
        .filter((delivery) => delivery.assignedDriverId)
        .map((delivery) => [delivery.assignedDriverId, delivery]),
    );
    const driverProjections = await Promise.all(
      drivers.map(async (driver) => {
        const latest = redis
          ? await redis.hgetall(
              `deliveryos:org:${organizationId}:driver:${driver.id}:location`,
            )
          : {};
        const fallback = latest.observedAt
          ? null
          : await database.driverLocationSnapshot.findFirst({
              where: { organizationId, driverId: driver.id },
              orderBy: { observedAt: "desc" },
            });
        const observedAt =
          latest.observedAt ?? fallback?.observedAt.toISOString();
        const tracked = observedAt
          ? {
              latitude: Number(latest.latitude ?? fallback?.latitude),
              longitude: Number(latest.longitude ?? fallback?.longitude),
              speedMps: latest.speedMps
                ? Number(latest.speedMps)
                : (fallback?.speedMps ?? null),
              headingDegrees: latest.headingDegrees
                ? Number(latest.headingDegrees)
                : (fallback?.headingDegrees ?? null),
              observedAt,
              source: latest.observedAt
                ? ("redis" as const)
                : ("postgres" as const),
            }
          : null;
        const job = assignmentByDriver.get(driver.id);
        const pickup = job?.stops.find((stop) => stop.kind === "PICKUP");
        const dropoff = job
          ? [...job.stops].reverse().find((stop) => stop.kind === "DROPOFF")
          : undefined;
        const inferred =
          !tracked && driver.status !== "OFFLINE"
            ? pickup && dropoff && job
              ? inferDriverRouteLocation({
                  status: job.status,
                  pickup: asCoordinate(pickup),
                  dropoff: asCoordinate(dropoff),
                })
              : {
                  ...PLAYFIELD_LANDMARKS.depot,
                  headingDegrees: headingTowardDropoff(),
                }
            : null;
        const location = tracked
          ? tracked
          : inferred
            ? {
                latitude: inferred.latitude,
                longitude: inferred.longitude,
                speedMps: null,
                headingDegrees: inferred.headingDegrees,
                observedAt: now.toISOString(),
                source: "inferred" as const,
              }
            : null;
        return {
          ...driver,
          activeLoad: job ? 1 : 0,
          routeCode: job?.externalReference ?? null,
          activeDeliveryId: job?.id ?? null,
          presence: tracked
            ? classifyFreshness(new Date(tracked.observedAt), now)
            : location
              ? ("RECENT" as const)
              : ("OFFLINE" as const),
          location,
        };
      }),
    );

    return Response.json({
      data: {
        organization,
        generatedAt: now.toISOString(),
        deliveries,
        drivers: driverProjections,
        zones,
        alerts,
        health: {
          redis: redis ? "available" : "unavailable",
          workerHeartbeat,
        },
      },
      meta: { requestId },
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
