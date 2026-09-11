import IORedis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claimTelemetrySequence } from "./telemetry-sequence";

const integration = process.env.REDIS_URL ? describe : describe.skip;
const client = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  lazyConnect: true,
  maxRetriesPerRequest: null,
});
const key = `deliveryos:test:sequence:${process.pid}`;

integration("telemetry sequence replay protection", () => {
  beforeAll(async () => {
    await client.connect();
    await client.del(key);
  });
  afterAll(async () => {
    await client.del(key);
    await client.quit();
  });

  it("accepts only monotonically increasing sequence numbers", async () => {
    expect(await claimTelemetrySequence(client, key, 4)).toBe(true);
    expect(await claimTelemetrySequence(client, key, 4)).toBe(false);
    expect(await claimTelemetrySequence(client, key, 3)).toBe(false);
    expect(await claimTelemetrySequence(client, key, 5)).toBe(true);
  });
});
