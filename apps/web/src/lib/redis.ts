import type { TelemetryEvent } from "@deliveryos/contracts";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { serverEnv } from "./env";

type TelemetryJob = TelemetryEvent & {
  organizationId: string;
  receivedAt: string;
};
export type SimulationJob = {
  action: "start" | "tick" | "pause" | "resume" | "stop" | "reset";
  organizationId: string;
  runId: string;
};
const globalRedis = globalThis as unknown as {
  deliveryOsRedis?: IORedis;
  deliveryOsTelemetryQueue?: Queue<TelemetryJob>;
  deliveryOsSimulationQueue?: Queue<SimulationJob>;
};

export const redis =
  globalRedis.deliveryOsRedis ??
  new IORedis(serverEnv.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
export const telemetryQueue =
  globalRedis.deliveryOsTelemetryQueue ??
  new Queue<TelemetryJob>("telemetry", { connection: redis });
export const simulationQueue =
  globalRedis.deliveryOsSimulationQueue ??
  new Queue<SimulationJob>("simulation", { connection: redis });

if (process.env.NODE_ENV !== "production") {
  globalRedis.deliveryOsRedis = redis;
  globalRedis.deliveryOsTelemetryQueue = telemetryQueue;
  globalRedis.deliveryOsSimulationQueue = simulationQueue;
}

export async function ensureRedis() {
  if (redis.status === "wait") await redis.connect();
  return redis;
}
