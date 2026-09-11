import { z } from "zod";

export const uuidSchema = z.uuid();
export const isoDateSchema = z.iso.datetime({ offset: true });

export const deliveryStatusSchema = z.enum([
  "UNASSIGNED",
  "ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED_PICKUP",
  "PICKED_UP",
  "EN_ROUTE_TO_DROPOFF",
  "ARRIVED_DROPOFF",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
  "RETURN_REQUIRED",
]);

export const deliveryCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ASSIGN"),
    driverId: uuidSchema,
    expectedVersion: z.int().positive(),
  }),
  z.object({
    type: z.literal("UNASSIGN"),
    expectedVersion: z.int().positive(),
  }),
  z.object({ type: z.literal("ACCEPT") }),
  z.object({ type: z.literal("START_PICKUP_ROUTE") }),
  z.object({ type: z.literal("ARRIVE_PICKUP") }),
  z.object({ type: z.literal("CONFIRM_PICKUP") }),
  z.object({ type: z.literal("DEPART_PICKUP") }),
  z.object({ type: z.literal("ARRIVE_DROPOFF") }),
  z.object({
    type: z.literal("COMPLETE"),
    recipientName: z.string().trim().min(1).max(120),
    note: z.string().trim().max(500).optional(),
  }),
  z.object({
    type: z.literal("CANCEL"),
    reason: z.string().trim().min(1).max(500),
  }),
  z.object({
    type: z.literal("FAIL"),
    reason: z.string().trim().min(1).max(500),
  }),
]);

export const deliveryStopInputSchema = z
  .object({
    kind: z.enum(["PICKUP", "DROPOFF"]),
    addressLine1: z.string().trim().min(3).max(160),
    addressLine2: z.string().trim().max(160).optional(),
    city: z.string().trim().min(2).max(100),
    postalCode: z.string().trim().min(2).max(20),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    instructions: z.string().trim().max(500).optional(),
  })
  .refine(
    (stop) => (stop.latitude === undefined) === (stop.longitude === undefined),
    { message: "Latitude and longitude must both be provided or omitted" },
  );

export const createDeliverySchema = z.object({
  externalReference: z.string().trim().max(80).optional(),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.email().optional(),
    phone: z.string().trim().max(40).optional(),
  }),
  priority: z.enum(["STANDARD", "HIGH", "URGENT"]).default("STANDARD"),
  packageCount: z.int().min(1).max(100).default(1),
  plannedPickupAt: isoDateSchema,
  promisedDeliveryAt: isoDateSchema,
  instructions: z.string().trim().max(1_000).optional(),
  stops: z
    .tuple([deliveryStopInputSchema, deliveryStopInputSchema])
    .refine(
      ([pickup, dropoff]) =>
        pickup.kind === "PICKUP" && dropoff.kind === "DROPOFF",
      {
        message: "Stops must contain pickup followed by drop-off",
      },
    ),
});

export const telemetryEventSchema = z.object({
  eventId: uuidSchema,
  driverId: uuidSchema,
  deviceSessionId: z.string().trim().min(8).max(120),
  sequence: z.int().nonnegative(),
  observedAt: isoDateSchema,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(1_000).optional(),
  speedMps: z.number().min(0).max(80).optional(),
  headingDegrees: z.number().min(0).lt(360).optional(),
  batteryPct: z.number().min(0).max(100).optional(),
});

export const telemetryBatchSchema = z.union([
  telemetryEventSchema.transform((event) => [event]),
  z.array(telemetryEventSchema).min(1).max(50),
]);

export const simulationConfigSchema = z.object({
  scenario: z.enum(["NORMAL_SHIFT", "PEAK_PERIOD", "DISRUPTION", "LATE_SHIFT"]),
  driverCount: z.union([z.literal(5), z.literal(25), z.literal(100)]),
  speed: z.union([z.literal(1), z.literal(2), z.literal(5), z.literal(10)]),
  seed: z.int().min(0).max(4_294_967_295),
});

export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;
export type DeliveryCommandInput = z.infer<typeof deliveryCommandSchema>;
export type CreateDeliveryInput = z.infer<typeof createDeliverySchema>;
export type SimulationConfig = z.infer<typeof simulationConfigSchema>;

export type ApiErrorCode =
  | "VALIDATION_FAILED"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "ASSIGNMENT_CONFLICT"
  | "DRIVER_UNAVAILABLE"
  | "CAPACITY_EXCEEDED"
  | "VERSION_CONFLICT"
  | "IDEMPOTENCY_MISMATCH"
  | "TELEMETRY_STALE"
  | "PROVIDER_UNAVAILABLE"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE";

export type ApiSuccess<T> = { data: T; meta?: { requestId: string } };
export type ApiFailure = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
    requestId: string;
  };
};

export type RealtimeEnvelope = {
  id: string;
  cursor: string;
  type: string;
  occurredAt: string;
  entity: { type: "delivery" | "driver" | "alert" | "simulation"; id: string };
  version?: number;
  payload: unknown;
};

export function validateTelemetryTime(
  observedAt: string,
  now = new Date(),
): "valid" | "stale" | "future" {
  const delta = new Date(observedAt).getTime() - now.getTime();
  if (delta > 120_000) return "future";
  if (delta < -300_000) return "stale";
  return "valid";
}
