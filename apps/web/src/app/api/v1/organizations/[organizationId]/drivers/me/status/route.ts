import { createHash } from "node:crypto";
import { z } from "zod";
import {
  ApiError,
  apiError,
  assertTrustedOrigin,
  requireIdempotencyKey,
  requireMembership,
} from "@/lib/api";

const inputSchema = z.object({
  status: z.enum(["AVAILABLE", "OFFLINE", "ON_BREAK"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    assertTrustedOrigin(request.headers);
    const { organizationId } = await params;
    const key = requireIdempotencyKey(request.headers);
    const input = inputSchema.safeParse(await request.json());
    if (!input.success)
      throw new ApiError(
        422,
        "VALIDATION_FAILED",
        "Driver status is invalid",
        input.error.flatten(),
      );
    const { database, session } = await requireMembership(
      request.headers,
      organizationId,
      ["DRIVER"],
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
      const driver = await transaction.driver.findUnique({
        where: { userId: session.user.id },
      });
      if (!driver || driver.organizationId !== organizationId)
        throw new ApiError(404, "NOT_FOUND", "Driver not found");
      const active = await transaction.delivery.count({
        where: {
          assignedDriverId: driver.id,
          status: {
            in: [
              "ASSIGNED",
              "ACCEPTED",
              "EN_ROUTE_TO_PICKUP",
              "ARRIVED_PICKUP",
              "PICKED_UP",
              "EN_ROUTE_TO_DROPOFF",
              "ARRIVED_DROPOFF",
            ],
          },
        },
      });
      if (active > 0 && input.data.status !== driver.status)
        throw new ApiError(
          409,
          "DRIVER_UNAVAILABLE",
          "Driver status cannot change during active work",
        );
      const updated = await transaction.driver.update({
        where: { id: driver.id },
        data: { status: input.data.status, version: { increment: 1 } },
      });
      const event = await transaction.domainEvent.create({
        data: {
          organizationId,
          aggregateType: "DRIVER",
          aggregateId: driver.id,
          driverId: driver.id,
          eventType:
            input.data.status === "OFFLINE"
              ? "driver.offline"
              : "driver.online",
          actorType: "DRIVER",
          actorId: driver.id,
          idempotencyKey: key,
          metadata: { status: input.data.status },
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
          operation: "driver.status",
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
