import { classifyFreshness } from "@deliveryos/domain";
import { apiError, requireMembership } from "@/lib/api";
import { ensureRedis } from "@/lib/redis";

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
    const [organization, deliveries, drivers, alerts] = await Promise.all([
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
        const location = observedAt
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
        return {
          ...driver,
          presence: observedAt
            ? classifyFreshness(new Date(observedAt), now)
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
