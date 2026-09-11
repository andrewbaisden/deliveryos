import { createHash, randomBytes } from "node:crypto";
import { createDeliverySchema } from "@deliveryos/contracts";
import { ProviderUnavailableError } from "@deliveryos/providers";
import {
  ApiError,
  apiError,
  assertTrustedOrigin,
  requireIdempotencyKey,
  requireMembership,
} from "@/lib/api";
import {
  calculateLeg,
  etaFromDurations,
  persistActiveRoute,
  resolveStopPlace,
} from "@/lib/routing";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function reference() {
  return `DOS-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${randomBytes(2).toString("hex").toUpperCase()}`;
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
    );
    const deliveries = await database.delivery.findMany({
      where: { organizationId },
      include: {
        customer: true,
        stops: { orderBy: { sequence: "asc" } },
        assignedDriver: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return Response.json({ data: deliveries, meta: { requestId } });
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
    const input = createDeliverySchema.safeParse(await request.json());
    if (!input.success)
      throw new ApiError(
        422,
        "VALIDATION_FAILED",
        "Delivery details are invalid",
        input.error.flatten(),
      );
    const { database, session } = await requireMembership(
      request.headers,
      organizationId,
      ["ADMIN", "DISPATCHER"],
    );
    const requestHash = hash(JSON.stringify(input.data));
    const existing = await database.idempotencyRecord.findUnique({
      where: {
        organizationId_actorFingerprint_key: {
          organizationId,
          actorFingerprint: session.user.id,
          key,
        },
      },
    });
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new ApiError(
          409,
          "IDEMPOTENCY_MISMATCH",
          "This idempotency key was used with a different request",
        );
      return Response.json(existing.responseBody, {
        status: existing.responseStatus ?? 200,
      });
    }

    const [pickupInput, dropoffInput] = input.data.stops;
    let resolvedStops: Array<{
      kind: "PICKUP" | "DROPOFF";
      addressLine1: string;
      addressLine2?: string | null;
      city: string;
      postalCode: string;
      latitude: number;
      longitude: number;
      instructions?: string | null;
    }>;
    let dropoffRoute: Awaited<ReturnType<typeof calculateLeg>>;
    try {
      const pickup = await resolveStopPlace({
        addressLine1: pickupInput.addressLine1,
        postalCode: pickupInput.postalCode,
        city: pickupInput.city,
      });
      const dropoff = await resolveStopPlace({
        addressLine1: dropoffInput.addressLine1,
        postalCode: dropoffInput.postalCode,
        city: dropoffInput.city,
      });
      resolvedStops = [
        {
          kind: "PICKUP",
          addressLine1: pickup.addressLine1,
          addressLine2: pickupInput.addressLine2 ?? null,
          city: pickup.city,
          postalCode: pickup.postalCode,
          latitude: pickup.latitude,
          longitude: pickup.longitude,
          instructions: pickupInput.instructions ?? null,
        },
        {
          kind: "DROPOFF",
          addressLine1: dropoff.addressLine1,
          addressLine2: dropoffInput.addressLine2 ?? null,
          city: dropoff.city,
          postalCode: dropoff.postalCode,
          latitude: dropoff.latitude,
          longitude: dropoff.longitude,
          instructions: dropoffInput.instructions ?? null,
        },
      ];
      dropoffRoute = await calculateLeg({
        origin: {
          latitude: pickup.latitude,
          longitude: pickup.longitude,
        },
        destination: {
          latitude: dropoff.latitude,
          longitude: dropoff.longitude,
        },
      });
    } catch (error) {
      if (error instanceof ProviderUnavailableError)
        throw new ApiError(
          503,
          "PROVIDER_UNAVAILABLE",
          "Geocoding or routing is temporarily unavailable",
        );
      throw error;
    }

    const originalEtaAt = etaFromDurations({
      toPickupSeconds: 0,
      toDropoffSeconds: dropoffRoute.durationSeconds,
      from: new Date(input.data.plannedPickupAt),
    });
    const trackingToken = randomBytes(32).toString("base64url");
    const result = await database.$transaction(
      async (transaction) => {
        const customer = await transaction.customer.create({
          data: {
            organizationId,
            name: input.data.customer.name,
            email: input.data.customer.email ?? null,
            phone: input.data.customer.phone ?? null,
          },
        });
        const delivery = await transaction.delivery.create({
          data: {
            organizationId,
            customerId: customer.id,
            reference: reference(),
            externalReference: input.data.externalReference ?? null,
            priority: input.data.priority,
            packageCount: input.data.packageCount,
            internalInstructions: input.data.instructions ?? null,
            plannedPickupAt: input.data.plannedPickupAt,
            promisedDeliveryAt: input.data.promisedDeliveryAt,
            originalEtaAt,
            currentEtaAt: originalEtaAt,
            stops: {
              create: resolvedStops.map((stop, sequence) => ({
                organizationId,
                sequence,
                kind: stop.kind,
                addressLine1: stop.addressLine1,
                addressLine2: stop.addressLine2 ?? null,
                city: stop.city,
                postalCode: stop.postalCode,
                latitude: stop.latitude,
                longitude: stop.longitude,
                instructions: stop.instructions ?? null,
              })),
            },
          },
          include: { customer: true, stops: true },
        });
        const pickupStop = delivery.stops.find(
          (stop) => stop.kind === "PICKUP",
        );
        const dropoffStop = delivery.stops.find(
          (stop) => stop.kind === "DROPOFF",
        );
        if (pickupStop && dropoffStop)
          await persistActiveRoute(transaction, {
            organizationId,
            deliveryId: delivery.id,
            legType: "TO_DROPOFF",
            origin: {
              latitude: Number(pickupStop.latitude),
              longitude: Number(pickupStop.longitude),
            },
            destination: {
              latitude: Number(dropoffStop.latitude),
              longitude: Number(dropoffStop.longitude),
            },
            route: dropoffRoute,
            reason: "delivery.created",
          });
        const domainEvent = await transaction.domainEvent.create({
          data: {
            organizationId,
            aggregateType: "DELIVERY",
            aggregateId: delivery.id,
            deliveryId: delivery.id,
            eventType: "delivery.created",
            actorType: "USER",
            actorId: session.user.id,
            idempotencyKey: key,
            metadata: { reference: delivery.reference },
          },
        });
        await transaction.outboxEvent.create({
          data: { organizationId, domainEventId: domainEvent.id },
        });
        await transaction.trackingToken.create({
          data: {
            organizationId,
            deliveryId: delivery.id,
            tokenHash: hash(trackingToken),
            expiresAt: new Date(
              new Date(input.data.promisedDeliveryAt).getTime() +
                7 * 86_400_000,
            ),
          },
        });
        const responseBody = {
          data: { ...delivery, trackingPath: `/track/${trackingToken}` },
          meta: { requestId },
        };
        await transaction.idempotencyRecord.create({
          data: {
            organizationId,
            actorFingerprint: session.user.id,
            key,
            operation: "delivery.create",
            requestHash,
            responseStatus: 201,
            responseBody,
            expiresAt: new Date(Date.now() + 30 * 86_400_000),
          },
        });
        return responseBody;
      },
      { isolationLevel: "Serializable" },
    );
    const { observability } = await import("@/lib/observability");
    observability.captureEvent("delivery_created", {
      organizationId,
      priority: input.data.priority,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return apiError(error, requestId);
  }
}
