import { describe, expect, it } from "vitest";
import {
  createDriverSchema,
  telemetryBatchSchema,
  telemetryEventSchema,
  updateDriverSchema,
  validateTelemetryTime,
} from ".";

const event = {
  eventId: "cfd045ca-d6fd-4ebc-a822-20ee108f3ba2",
  driverId: "4bfab3aa-2b98-45ec-9b4d-dd19ceeb3803",
  deviceSessionId: "device-session-one",
  sequence: 1,
  observedAt: "2026-09-10T12:00:00.000Z",
  latitude: 51.5074,
  longitude: -0.1278,
};

describe("telemetry contract", () => {
  it("accepts one event and normalises it to a batch", () => {
    expect(telemetryBatchSchema.parse(event)).toEqual([event]);
  });

  it.each([
    ["latitude", 91],
    ["longitude", -181],
    ["accuracyM", 1_001],
    ["speedMps", -1],
    ["speedMps", 81],
    ["headingDegrees", 360],
    ["headingDegrees", -1],
    ["batteryPct", 101],
  ])("rejects invalid %s", (field, value) => {
    expect(
      telemetryEventSchema.safeParse({ ...event, [field]: value }).success,
    ).toBe(false);
  });

  it("rejects stale and future timestamps", () => {
    const now = new Date("2026-09-10T12:00:00Z");
    expect(validateTelemetryTime("2026-09-10T11:54:59Z", now)).toBe("stale");
    expect(validateTelemetryTime("2026-09-10T12:02:01Z", now)).toBe("future");
  });

  it("accepts at most fifty telemetry events", () => {
    expect(
      telemetryBatchSchema.safeParse(
        Array.from({ length: 51 }, (_, sequence) => ({
          ...event,
          eventId: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
          sequence,
        })),
      ).success,
    ).toBe(false);
  });

  it("rejects negative sequence numbers", () => {
    expect(
      telemetryEventSchema.safeParse({ ...event, sequence: -1 }).success,
    ).toBe(false);
  });
});

describe("driver contracts", () => {
  it("creates a driver with defaults", () => {
    expect(createDriverSchema.parse({ name: "Maya Patel" })).toEqual({
      name: "Maya Patel",
      maxConcurrentDeliveries: 1,
      status: "AVAILABLE",
    });
  });

  it("rejects empty driver updates", () => {
    expect(updateDriverSchema.safeParse({}).success).toBe(false);
  });

  it("rejects operational statuses that dispatchers cannot set", () => {
    expect(
      createDriverSchema.safeParse({
        name: "Maya Patel",
        status: "ON_DELIVERY",
      }).success,
    ).toBe(false);
  });
});
