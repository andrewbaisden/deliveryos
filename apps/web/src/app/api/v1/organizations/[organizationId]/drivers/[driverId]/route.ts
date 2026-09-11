import { createHash } from "node:crypto";
import { updateDriverSchema } from "@deliveryos/contracts";
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; driverId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    assertTrustedOrigin(request.headers);
    const { organizationId, driverId } = await params;
    const key = requireIdempotencyKey(request.headers);
    const input = updateDriverSchema.safeParse(await request.json());
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
        status: previous.responseStatus ?? 200,
      });
    }
    const result = await database.$transaction(async (transaction) => {
      const driver = await transaction.driver.findFirst({
        where: { id: driverId, organizationId },
      });
      if (!driver) throw new ApiError(404, "NOT_FOUND", "Driver not found");
      if (input.data.zoneId) {
        const zone = await transaction.zone.findFirst({
          where: { id: input.data.zoneId, organizationId },
        });
        if (!zone) throw new ApiError(404, "NOT_FOUND", "Zone not found");
      }
      const active = await transaction.delivery.count({
        where: {
          assignedDriverId: driver.id,
          status: { in: [...activeStatuses] },
        },
      });
      if (
        active > 0 &&
        input.data.status &&
        input.data.status !== driver.status
      )
        throw new ApiError(
          409,
          "DRIVER_UNAVAILABLE",
          "Driver status cannot change during active work",
        );
      const updated = await transaction.driver.update({
        where: { id: driver.id },
        data: {
          ...(input.data.name ? { name: input.data.name } : {}),
          ...(input.data.maxConcurrentDeliveries
            ? { maxConcurrentDeliveries: input.data.maxConcurrentDeliveries }
            : {}),
          ...(input.data.status ? { status: input.data.status } : {}),
          ...(input.data.zoneId !== undefined
            ? { zoneId: input.data.zoneId }
            : {}),
          version: { increment: 1 },
        },
        include: { zone: { select: { id: true, name: true } } },
      });
      const event = await transaction.domainEvent.create({
        data: {
          organizationId,
          aggregateType: "DRIVER",
          aggregateId: driver.id,
          driverId: driver.id,
          eventType: "driver.updated",
          actorType: "USER",
          actorId: session.user.id,
          idempotencyKey: key,
          metadata: { updatedFields: Object.keys(input.data) },
        },
      });
      await transaction.outboxEvent.create({
        data: { organizationId, domainEventId: event.id },
      });
      const body = { data: updated, meta: { requestId } };
      await transaction.idempotencyRecord.create({
        data: {
          organizationId,
          actorFingerprint: session.user.id,
          key,
          operation: "driver.update",
          requestHash,
          responseStatus: 200,
          responseBody: body,
          expiresAt: new Date(Date.now() + 30 * 86_400_000),
        },
      });
      return body;
    });
    return Response.json(result);
  } catch (error) {
    return apiError(error, requestId);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; driverId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    assertTrustedOrigin(request.headers);
    const { organizationId, driverId } = await params;
    const key = requireIdempotencyKey(request.headers);
    const { database, session } = await requireMembership(
      request.headers,
      organizationId,
      ["ADMIN", "DISPATCHER"],
    );
    const requestHash = createHash("sha256")
      .update(`delete:${driverId}`)
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
        status: previous.responseStatus ?? 200,
      });
    }
    const result = await database.$transaction(async (transaction) => {
      const driver = await transaction.driver.findFirst({
        where: { id: driverId, organizationId },
      });
      if (!driver) throw new ApiError(404, "NOT_FOUND", "Driver not found");
      if (driver.userId)
        throw new ApiError(
          409,
          "DRIVER_UNAVAILABLE",
          "Unlink the login account before removing this driver",
        );
      const active = await transaction.delivery.count({
        where: {
          assignedDriverId: driver.id,
          status: { in: [...activeStatuses] },
        },
      });
      if (active > 0)
        throw new ApiError(
          409,
          "ASSIGNMENT_CONFLICT",
          "Finish or reassign active deliveries before removing this driver",
        );
      if (driver.simulationRunId) {
        const run = await transaction.simulationRun.findFirst({
          where: { id: driver.simulationRunId, status: "RUNNING" },
        });
        if (run)
          throw new ApiError(
            409,
            "DRIVER_UNAVAILABLE",
            "Stop the simulation before removing simulated drivers",
          );
      }
      const event = await transaction.domainEvent.create({
        data: {
          organizationId,
          aggregateType: "DRIVER",
          aggregateId: driver.id,
          eventType: "driver.removed",
          actorType: "USER",
          actorId: session.user.id,
          idempotencyKey: key,
          metadata: { name: driver.name },
        },
      });
      await transaction.outboxEvent.create({
        data: { organizationId, domainEventId: event.id },
      });
      await transaction.driver.delete({ where: { id: driver.id } });
      const body = { data: { id: driver.id }, meta: { requestId } };
      await transaction.idempotencyRecord.create({
        data: {
          organizationId,
          actorFingerprint: session.user.id,
          key,
          operation: "driver.delete",
          requestHash,
          responseStatus: 200,
          responseBody: body,
          expiresAt: new Date(Date.now() + 30 * 86_400_000),
        },
      });
      return body;
    });
    return Response.json(result);
  } catch (error) {
    return apiError(error, requestId);
  }
}
