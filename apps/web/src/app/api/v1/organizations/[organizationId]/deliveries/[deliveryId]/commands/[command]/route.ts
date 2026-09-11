import { createHash } from "node:crypto";
import { deliveryCommandSchema } from "@deliveryos/contracts";
import { database as databaseClient } from "@deliveryos/database/client";
import { type DeliveryCommand, transitionDelivery } from "@deliveryos/domain";
import { ProviderUnavailableError } from "@deliveryos/providers";
import {
  ApiError,
  apiError,
  assertTrustedOrigin,
  requireIdempotencyKey,
  requireMembership,
} from "@/lib/api";
import { ensureRedis } from "@/lib/redis";
import {
  calculateLeg,
  etaFromDurations,
  persistActiveRoute,
} from "@/lib/routing";

const commands: Record<string, DeliveryCommand> = {
  assign: "ASSIGN",
  unassign: "UNASSIGN",
  accept: "ACCEPT",
  "start-pickup": "START_PICKUP_ROUTE",
  "arrive-pickup": "ARRIVE_PICKUP",
  "confirm-pickup": "CONFIRM_PICKUP",
  "depart-pickup": "DEPART_PICKUP",
  "arrive-dropoff": "ARRIVE_DROPOFF",
  complete: "COMPLETE",
  cancel: "CANCEL",
  fail: "FAIL",
};
const dispatcherCommands: DeliveryCommand[] = ["ASSIGN", "UNASSIGN", "CANCEL"];

async function authorizeActor(
  request: Request,
  organizationId: string,
  command: DeliveryCommand,
) {
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!dispatcherCommands.includes(command) && bearer) {
    if (!databaseClient)
      throw new ApiError(
        503,
        "SERVICE_UNAVAILABLE",
        "Database is not configured",
      );
    const credential = await databaseClient.driverCredential.findUnique({
      where: { prefix: bearer.slice(0, 12) },
    });
    const secretHash = createHash("sha256").update(bearer).digest("hex");
    if (
      !credential ||
      credential.organizationId !== organizationId ||
      credential.secretHash !== secretHash ||
      credential.revokedAt ||
      (credential.expiresAt && credential.expiresAt < new Date())
    )
      throw new ApiError(401, "AUTH_REQUIRED", "Invalid driver credential");
    return {
      database: databaseClient,
      role: "DRIVER" as const,
      actorFingerprint: `driver:${credential.driverId}`,
      actorId: credential.driverId,
      authorizedDriverId: credential.driverId,
    };
  }
  const roles = dispatcherCommands.includes(command)
    ? (["ADMIN", "DISPATCHER"] as const)
    : (["ADMIN", "DRIVER"] as const);
  const { database, session, membership } = await requireMembership(
    request.headers,
    organizationId,
    [...roles],
  );
  const linkedDriver =
    membership.role === "DRIVER"
      ? await database.driver.findUnique({ where: { userId: session.user.id } })
      : null;
  return {
    database,
    role: membership.role,
    actorFingerprint: session.user.id,
    actorId: session.user.id,
    authorizedDriverId: linkedDriver?.id ?? null,
  };
}

async function retrySerializable<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String(error.code)
          : "";
      if (attempt === 2 || !["P2034", "40001"].includes(code)) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, 15 + Math.random() * 35),
      );
    }
  }
  throw new Error("Serializable retry exhausted");
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      organizationId: string;
      deliveryId: string;
      command: string;
    }>;
  },
) {
  const requestId = crypto.randomUUID();
  try {
    assertTrustedOrigin(request.headers);
    const { organizationId, deliveryId, command: commandSlug } = await params;
    const command = commands[commandSlug];
    if (!command) throw new ApiError(404, "NOT_FOUND", "Command not found");
    const key = requireIdempotencyKey(request.headers);
    const raw = await request.json().catch(() => ({}));
    const input = deliveryCommandSchema.safeParse({ ...raw, type: command });
    if (!input.success)
      throw new ApiError(
        422,
        "VALIDATION_FAILED",
        "Command is invalid",
        input.error.flatten(),
      );
    const actor = await authorizeActor(request, organizationId, command);
    const { database } = actor;
    const assignedDriverId =
      input.data.type === "ASSIGN" ? input.data.driverId : undefined;
    const completion = input.data.type === "COMPLETE" ? input.data : undefined;
    const requestHash = createHash("sha256")
      .update(JSON.stringify(input.data))
      .digest("hex");
    const previous = await database.idempotencyRecord.findUnique({
      where: {
        organizationId_actorFingerprint_key: {
          organizationId,
          actorFingerprint: actor.actorFingerprint,
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

    let assignmentRoutes: {
      origin: { latitude: number; longitude: number };
      pickup: { latitude: number; longitude: number };
      dropoff: { latitude: number; longitude: number };
      toPickup: Awaited<ReturnType<typeof calculateLeg>>;
      toDropoff: Awaited<ReturnType<typeof calculateLeg>> | null;
      dropoffSeconds: number;
    } | null = null;
    if (command === "ASSIGN" && assignedDriverId) {
      const stops = await database.deliveryStop.findMany({
        where: { deliveryId, organizationId },
        orderBy: { sequence: "asc" },
      });
      const pickup = stops.find((stop) => stop.kind === "PICKUP");
      const dropoff = stops.find((stop) => stop.kind === "DROPOFF");
      if (pickup && dropoff) {
        let origin = {
          latitude: Number(pickup.latitude) + 0.008,
          longitude: Number(pickup.longitude) - 0.01,
        };
        try {
          const redis = await ensureRedis();
          const latest = await redis.hgetall(
            `deliveryos:{${organizationId}}:driver:${assignedDriverId}:location`,
          );
          if (latest.latitude && latest.longitude)
            origin = {
              latitude: Number(latest.latitude),
              longitude: Number(latest.longitude),
            };
        } catch {
          // Redis is optional for assignment; fall back to a nearby origin.
        }
        try {
          const toPickup = await calculateLeg({
            origin,
            destination: {
              latitude: Number(pickup.latitude),
              longitude: Number(pickup.longitude),
            },
          });
          const existingDropoff = await database.route.findFirst({
            where: {
              deliveryId,
              legType: "TO_DROPOFF",
              isActive: true,
              status: "READY",
            },
          });
          const toDropoff =
            existingDropoff?.durationSeconds != null
              ? null
              : await calculateLeg({
                  origin: {
                    latitude: Number(pickup.latitude),
                    longitude: Number(pickup.longitude),
                  },
                  destination: {
                    latitude: Number(dropoff.latitude),
                    longitude: Number(dropoff.longitude),
                  },
                });
          assignmentRoutes = {
            origin,
            pickup: {
              latitude: Number(pickup.latitude),
              longitude: Number(pickup.longitude),
            },
            dropoff: {
              latitude: Number(dropoff.latitude),
              longitude: Number(dropoff.longitude),
            },
            toPickup,
            toDropoff,
            dropoffSeconds:
              existingDropoff?.durationSeconds ??
              toDropoff?.durationSeconds ??
              1_200,
          };
        } catch (error) {
          if (error instanceof ProviderUnavailableError)
            throw new ApiError(
              503,
              "PROVIDER_UNAVAILABLE",
              "Routing is temporarily unavailable",
            );
          throw error;
        }
      }
    }

    const result = await retrySerializable(() =>
      database.$transaction(
        async (transaction) => {
          await transaction.$queryRaw`SELECT id FROM "Delivery" WHERE id = ${deliveryId}::uuid AND "organizationId" = ${organizationId}::uuid FOR UPDATE`;
          const delivery = await transaction.delivery.findFirst({
            where: { id: deliveryId, organizationId },
          });
          if (!delivery)
            throw new ApiError(404, "NOT_FOUND", "Delivery not found");
          if (
            "expectedVersion" in input.data &&
            delivery.version !== input.data.expectedVersion
          )
            throw new ApiError(
              409,
              "VERSION_CONFLICT",
              "Delivery changed; refresh before retrying",
            );
          if (actor.role === "DRIVER") {
            if (
              !actor.authorizedDriverId ||
              actor.authorizedDriverId !== delivery.assignedDriverId
            )
              throw new ApiError(
                403,
                "FORBIDDEN",
                "This delivery is not assigned to this driver",
              );
          }
          if (command === "ASSIGN") {
            if (!assignedDriverId)
              throw new ApiError(
                422,
                "VALIDATION_FAILED",
                "Driver is required",
              );
            const driver = await transaction.driver.findFirst({
              where: { id: assignedDriverId, organizationId },
            });
            if (!driver)
              throw new ApiError(404, "NOT_FOUND", "Driver not found");
            await transaction.$queryRaw`SELECT id FROM "Driver" WHERE id = ${driver.id}::uuid FOR UPDATE`;
            const load = await transaction.delivery.count({
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
            if (driver.status === "OFFLINE" || driver.status === "ON_BREAK")
              throw new ApiError(
                409,
                "DRIVER_UNAVAILABLE",
                "Driver is not available",
              );
            if (load >= driver.maxConcurrentDeliveries)
              throw new ApiError(
                409,
                "CAPACITY_EXCEEDED",
                "Driver has no remaining capacity",
              );
          }
          const transitioned = transitionDelivery(
            {
              status: delivery.status,
              version: delivery.version,
              assignedDriverId: delivery.assignedDriverId,
              actualPickupAt: delivery.actualPickupAt,
              actualDeliveryAt: delivery.actualDeliveryAt,
            },
            command,
            {
              now: new Date(),
              ...(assignedDriverId ? { assignedDriverId } : {}),
              ...(completion
                ? { recipientName: completion.recipientName }
                : {}),
            },
          );
          let updated = await transaction.delivery.update({
            where: { id: delivery.id },
            data: {
              status: transitioned.delivery.status,
              version: transitioned.delivery.version,
              assignedDriverId: transitioned.delivery.assignedDriverId,
              actualPickupAt: transitioned.delivery.actualPickupAt,
              actualDeliveryAt: transitioned.delivery.actualDeliveryAt,
              ...(completion
                ? {
                    recipientName: completion.recipientName,
                    proofNote: completion.note ?? null,
                  }
                : {}),
            },
          });
          if (command === "ASSIGN") {
            if (!assignedDriverId)
              throw new ApiError(
                422,
                "VALIDATION_FAILED",
                "Driver is required",
              );
            await transaction.deliveryAssignment.create({
              data: {
                organizationId,
                deliveryId,
                driverId: assignedDriverId,
                assignedById: actor.actorId,
              },
            });
            await transaction.driver.update({
              where: { id: assignedDriverId },
              data: { status: "ASSIGNED", version: { increment: 1 } },
            });
            if (assignmentRoutes) {
              await persistActiveRoute(transaction, {
                organizationId,
                deliveryId,
                legType: "TO_PICKUP",
                origin: assignmentRoutes.origin,
                destination: assignmentRoutes.pickup,
                route: assignmentRoutes.toPickup,
                reason: "delivery.assigned",
              });
              if (assignmentRoutes.toDropoff)
                await persistActiveRoute(transaction, {
                  organizationId,
                  deliveryId,
                  legType: "TO_DROPOFF",
                  origin: assignmentRoutes.pickup,
                  destination: assignmentRoutes.dropoff,
                  route: assignmentRoutes.toDropoff,
                  reason: "delivery.assigned",
                });
              const eta = etaFromDurations({
                toPickupSeconds: assignmentRoutes.toPickup.durationSeconds,
                toDropoffSeconds: assignmentRoutes.dropoffSeconds,
              });
              updated = await transaction.delivery.update({
                where: { id: deliveryId },
                data: {
                  originalEtaAt: delivery.originalEtaAt ?? eta,
                  currentEtaAt: eta,
                },
              });
            }
          } else if (command === "UNASSIGN" || command === "CANCEL") {
            if (delivery.assignedDriverId)
              await transaction.driver.update({
                where: { id: delivery.assignedDriverId },
                data: { status: "AVAILABLE", version: { increment: 1 } },
              });
            await transaction.deliveryAssignment.updateMany({
              where: { deliveryId, endedAt: null },
              data: {
                endedAt: new Date(),
                endReason: command === "CANCEL" ? "CANCELLED" : "UNASSIGNED",
              },
            });
          } else if (command === "ACCEPT" && delivery.assignedDriverId)
            await transaction.driver.update({
              where: { id: delivery.assignedDriverId },
              data: { status: "ON_DELIVERY", version: { increment: 1 } },
            });
          else if (
            ["COMPLETE", "FAIL"].includes(command) &&
            delivery.assignedDriverId
          ) {
            await transaction.driver.update({
              where: { id: delivery.assignedDriverId },
              data: { status: "AVAILABLE", version: { increment: 1 } },
            });
            await transaction.deliveryAssignment.updateMany({
              where: { deliveryId, endedAt: null },
              data: {
                endedAt: new Date(),
                endReason: command === "COMPLETE" ? "COMPLETED" : "FAILED",
              },
            });
          }
          const domainEvent = await transaction.domainEvent.create({
            data: {
              organizationId,
              aggregateType: "DELIVERY",
              aggregateId: deliveryId,
              deliveryId,
              driverId: transitioned.delivery.assignedDriverId,
              eventType: transitioned.eventType,
              actorType: actor.role === "DRIVER" ? "DRIVER" : "USER",
              actorId: actor.actorId,
              idempotencyKey: key,
              metadata: completion
                ? { recipientName: completion.recipientName }
                : {},
            },
          });
          await transaction.outboxEvent.create({
            data: { organizationId, domainEventId: domainEvent.id },
          });
          const responseBody = { data: updated, meta: { requestId } };
          await transaction.idempotencyRecord.create({
            data: {
              organizationId,
              actorFingerprint: actor.actorFingerprint,
              key,
              operation: `delivery.${commandSlug}`,
              requestHash,
              responseStatus: 200,
              responseBody,
              expiresAt: new Date(Date.now() + 30 * 86_400_000),
            },
          });
          return responseBody;
        },
        { isolationLevel: "Serializable" },
      ),
    );
    return Response.json(result);
  } catch (error) {
    return apiError(error, requestId);
  }
}
