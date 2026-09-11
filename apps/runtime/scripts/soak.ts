import { createDatabase } from "@deliveryos/database/client";
import { Queue } from "bullmq";
import { z } from "zod";
import { createRedis, streamKey } from "../src/redis";

const appUrl = process.env.WEB_ORIGIN ?? "http://127.0.0.1:3100";
const organizationId =
  process.env.SOAK_ORGANIZATION_ID ?? "11111111-1111-4111-8111-111111111111";
const database = createDatabase();
const redis = createRedis();
const startResponseSchema = z.object({
  data: z.object({ id: z.string().uuid() }),
});

async function post(path: string, cookie: string, body?: unknown) {
  return fetch(`${appUrl}${path}`, {
    method: "POST",
    headers: {
      cookie,
      origin: appUrl,
      "idempotency-key": `soak-${Date.now()}-${crypto.randomUUID()}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function main() {
  await redis.connect();
  const signIn = await fetch(`${appUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: appUrl },
    body: JSON.stringify({
      email: process.env.SOAK_ADMIN_EMAIL ?? "admin@deliveryos.local",
      password: process.env.SOAK_ADMIN_PASSWORD ?? "ChangeMe123!",
    }),
  });
  if (!signIn.ok) throw new Error(`Soak sign-in failed: ${signIn.status}`);
  const cookie = signIn.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .filter((value): value is string => Boolean(value))
    .join("; ");
  const started = await post(
    `/api/v1/organizations/${organizationId}/simulations/start`,
    cookie,
    {
      scenario: "DISRUPTION",
      driverCount: 100,
      speed: 10,
      seed: 812_764,
    },
  );
  if (!started.ok)
    throw new Error(
      `Soak start failed: ${started.status} ${await started.text()}`,
    );
  const runId = startResponseSchema.parse(await started.json()).data.id;
  try {
    const deadline = Date.now() + 5 * 60_000;
    let run = await database.simulationRun.findUniqueOrThrow({
      where: { id: runId },
    });
    while (run.status === "RUNNING" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      run = await database.simulationRun.findUniqueOrThrow({
        where: { id: runId },
      });
    }
    if (run.status !== "COMPLETED")
      throw new Error(`Soak did not complete: ${run.status}`);
    if (Number(run.logicalTimeMs) < 600_000)
      throw new Error("Soak ended before ten logical minutes");

    const queueEntries = await Promise.all(
      ["telemetry", "simulation", "operations", "routing"].map(async (name) => {
        const queueConnection = createRedis();
        const queue = new Queue(name, { connection: queueConnection });
        const counts = await queue.getJobCounts();
        await queue.close();
        queueConnection.disconnect();
        return [name, counts] as const;
      }),
    );
    const queues = Object.fromEntries(queueEntries);
    if (
      Object.values(queues).some(
        (counts) =>
          counts.failed > 0 || counts.active > 0 || counts.waiting > 0,
      )
    )
      throw new Error(`Queues did not drain: ${JSON.stringify(queues)}`);
    const rows = await redis.xrevrange(
      streamKey(organizationId),
      "+",
      "-",
      "COUNT",
      5_000,
    );
    const latencies = rows
      .flatMap(([id, fields]) => {
        const payloadIndex = fields.indexOf("payload");
        const payload = z
          .object({ type: z.string(), occurredAt: z.string().datetime() })
          .safeParse(JSON.parse(fields[payloadIndex + 1] ?? "{}"));
        if (!payload.success || payload.data.type !== "driver.location_updated")
          return [];
        return [
          Number(id.split("-", 1)[0]) -
            new Date(payload.data.occurredAt).getTime(),
        ];
      })
      .sort((left, right) => left - right);
    const p95Ms =
      latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)];
    if (p95Ms === undefined || p95Ms >= 2_000)
      throw new Error(
        `Telemetry p95 exceeded target: ${p95Ms ?? "no samples"}`,
      );
    const statuses = await database.delivery.groupBy({
      by: ["status"],
      where: { simulationRunId: runId },
      _count: true,
    });
    const pendingOutbox = await database.outboxEvent.count({
      where: { status: "PENDING" },
    });
    if (pendingOutbox > 0)
      throw new Error(`Outbox did not drain: ${pendingOutbox}`);
    console.log({
      runId,
      logicalMinutes: Number(run.logicalTimeMs) / 60_000,
      statuses,
      streamLength: await redis.xlen(streamKey(organizationId)),
      telemetrySamples: latencies.length,
      telemetryP95Ms: p95Ms,
      queues,
      pendingOutbox,
    });
  } finally {
    const reset = await post(
      `/api/v1/organizations/${organizationId}/simulations/${runId}/reset`,
      cookie,
    );
    if (!reset.ok) console.error("soak_reset_failed", { status: reset.status });
  }
}

try {
  await main();
} finally {
  await redis.quit();
  await database.$disconnect();
}
