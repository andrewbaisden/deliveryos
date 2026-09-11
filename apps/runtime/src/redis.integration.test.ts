import { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TelemetryJob } from "./queues";
import { createRedis } from "./redis";
import { compareStreamIds } from "./stream";
import { setLatestLocation } from "./telemetry-projection";

const integration = process.env.REDIS_URL ? describe : describe.skip;
const redis = createRedis();
const key = `deliveryos:test:location:${process.pid}`;

describe("stream cursors", () => {
  it("orders Redis stream IDs by time and sequence", () => {
    expect(compareStreamIds("100-0", "100-1")).toBe(-1);
    expect(compareStreamIds("101-0", "100-99")).toBe(1);
    expect(compareStreamIds("100-1", "100-1")).toBe(0);
  });
});

integration("Redis telemetry projections", () => {
  beforeAll(async () => {
    await redis.connect();
    await redis.del(key);
  });
  afterAll(async () => {
    await redis.del(key);
    await redis.quit();
  });

  it("atomically rejects an older observation", async () => {
    const base: TelemetryJob = {
      organizationId: "00000000-0000-4000-8000-000000000000",
      eventId: "00000000-0000-4000-8000-000000000001",
      driverId: "00000000-0000-4000-8000-000000000002",
      deviceSessionId: "integration-device",
      sequence: 2,
      observedAt: "2026-09-10T12:00:02.000Z",
      receivedAt: "2026-09-10T12:00:03.000Z",
      latitude: 51.5,
      longitude: -0.2,
    };
    expect(await setLatestLocation(redis, key, base)).toBe(true);
    expect(
      await setLatestLocation(redis, key, {
        ...base,
        eventId: "00000000-0000-4000-8000-000000000003",
        sequence: 1,
        observedAt: "2026-09-10T12:00:01.000Z",
        latitude: 52,
      }),
    ).toBe(false);
    const stored = await redis.hgetall(key);
    expect(stored.latitude).toBe("51.5");
    expect(stored.observedAt).toBe(base.observedAt);
  });

  it("deduplicates BullMQ jobs with stable IDs", async () => {
    const queueName = `deliveryos-test-${process.pid}-${Date.now()}`;
    const queue = new Queue(queueName, { connection: createRedis() });
    try {
      await queue.add("telemetry", { sequence: 1 }, { jobId: "same-event" });
      await queue.add("telemetry", { sequence: 1 }, { jobId: "same-event" });
      expect(await queue.count()).toBe(1);
      await queue.obliterate({ force: true });
    } finally {
      await queue.close();
    }
  });
});
