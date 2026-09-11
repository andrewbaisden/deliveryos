import { createHash } from "node:crypto";
import { createDriverSchema } from "@deliveryos/contracts";
import {
  ApiError,
  apiError,
  assertTrustedOrigin,
  requireIdempotencyKey,
  requireMembership,
} from "@/lib/api";

const activeStatuses = [
  "ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED_PICKUP",
  "PICKED_UP",
  "EN_ROUTE_TO_DROPOFF",
  "ARRIVED_DROPOFF",
] as const;

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
    const [drivers, zones] = await Promise.all([
      database.driver.findMany({
        where: { organizationId },
        include: {
          zone: { select: { id: true, name: true } },
          snapshots: { orderBy: { observedAt: "desc" }, take: 1 },
          _count: {
            select: {
              assignedDeliveries: {
                where: { status: { in: [...activeStatuses] } },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
      database.zone.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return Response.json({ data: { drivers, zones }, meta: { requestId } });
  } catch (error) {
    return apiError(error, requestId);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    assertTrustedOrigin(request.headers);
    const { organizationId } = await params;
    const key = requireIdempotencyKey(request.headers);
    const input = createDriverSchema.safeParse(await request.json());
    if (!input.success)
      throw new ApiError(
        422,
        "VALIDATION_FAILED",
        "Driver details are invalid",
        input.error.flatten(),
      );
    const { database, session } = await requireMembership(
      request.headers,
      organizationId,
      ["ADMIN", "DISPATCHER"],
    );
    const requestHash = createHash("sha256")
      .update(JSON.stringify(input.data))
      .digest("hex");
    const previous = await database.idempotencyRecord.findUnique({
      where: {
        organizationId_actorFingerprint_key: {
          organizationId,
          actorFingerprint: session.user.id,
          key,
        },
      },
    });
    if (previous) {
      if (previous.requestHash !== requestHash)
        throw new ApiError(
          409,
          "IDEMPOTENCY_MISMATCH",
          "This idempotency key was used with another request",
        );
      return Response.json(previous.responseBody, {
        status: previous.responseStatus ?? 201,
      });
    }
    const result = await database.$transaction(async (transaction) => {
      if (input.data.zoneId) {
        const zone = await transaction.zone.findFirst({
          where: { id: input.data.zoneId, organizationId },
        });
        if (!zone) throw new ApiError(404, "NOT_FOUND", "Zone not found");
      }
      const driver = await transaction.driver.create({
        data: {
          organizationId,
          name: input.data.name,
          zoneId: input.data.zoneId ?? null,
          maxConcurrentDeliveries: input.data.maxConcurrentDeliveries,
          status: input.data.status,
        },
        include: { zone: { select: { id: true, name: true } } },
      });
      const event = await transaction.domainEvent.create({
        data: {
          organizationId,
          aggregateType: "DRIVER",
          aggregateId: driver.id,
          driverId: driver.id,
          eventType: "driver.created",
          actorType: "USER",
          actorId: session.user.id,
          idempotencyKey: key,
          metadata: {
            status: driver.status,
            maxConcurrentDeliveries: driver.maxConcurrentDeliveries,
          },
        },
      });
      await transaction.outboxEvent.create({
        data: { organizationId, domainEventId: event.id },
      });
      const body = { data: driver, meta: { requestId } };
      await transaction.idempotencyRecord.create({
        data: {
          organizationId,
          actorFingerprint: session.user.id,
          key,
          operation: "driver.create",
          requestHash,
          responseStatus: 201,
          responseBody: body,
          expiresAt: new Date(Date.now() + 30 * 86_400_000),
        },
      });
      return body;
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return apiError(error, requestId);
  }
}
