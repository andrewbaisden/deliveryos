import type { TelemetryEvent } from "@deliveryos/contracts";
import { Queue } from "bullmq";
import { createRedis } from "./redis";

export type TelemetryJob = TelemetryEvent & {
  organizationId: string;
  receivedAt: string;
};
export type SimulationJob = {
  action: "start" | "tick" | "pause" | "resume" | "stop" | "reset";
  organizationId: string;
  runId: string;
};

export const queueConnection = createRedis();
export const telemetryQueue = new Queue<TelemetryJob>("telemetry", {
  connection: queueConnection,
});
export const routingQueue = new Queue("routing", {
  connection: queueConnection,
});
export const operationsQueue = new Queue("operations", {
  connection: queueConnection,
});
export const simulationQueue = new Queue<SimulationJob>("simulation", {
  connection: queueConnection,
});

export const telemetryJobOptions = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 250 },
  removeOnComplete: { age: 86_400, count: 10_000 },
  removeOnFail: { age: 604_800 },
};
