import { createHash, createHmac } from "node:crypto";
import type { RealtimeEnvelope } from "@deliveryos/contracts";
import { database } from "@deliveryos/database/client";
import { distanceMetres } from "@deliveryos/domain";
import { Worker } from "bullmq";
import { config } from "./config";
import { observability } from "./observability";
import {
  evaluateDriverPresence,
  evaluateOperationalTelemetry,
} from "./operational-intelligence";
import {
  type SimulationJob,
  simulationQueue,
  type TelemetryJob,
} from "./queues";
import { createRedis, locationKey, streamKey } from "./redis";
import { runTelemetryRetention } from "./retention";
import { createSimulationAgents, shouldCompleteSimulation } from "./simulation";
import { setLatestLocation } from "./telemetry-projection";

const connection = createRedis();
const stateRedis = createRedis();
await stateRedis.connect();

const telemetryWorker = new Worker<TelemetryJob>(
  "telemetry",
  async (job) => {
    const telemetry = job.data;
    const latestKey = locationKey(telemetry.organizationId, telemetry.driverId);
    const observedEpochMs = new Date(telemetry.observedAt).getTime();
    if (!(await setLatestLocation(stateRedis, latestKey, telemetry)))
      return { ignored: true };

    if (database) {
      const sampledKey = `${latestKey}:sampled`;
      const sampled = await stateRedis.hgetall(sampledKey);
      const sampleAge = observedEpochMs - Number(sampled.observedEpochMs ?? 0);
      const moved = sampled.latitude
        ? distanceMetres(
            {
              latitude: Number(sampled.latitude),
              longitude: Number(sampled.longitude),
            },
            { latitude: telemetry.latitude, longitude: telemetry.longitude },
          )
        : Number.POSITIVE_INFINITY;
      if (!sampled.observedEpochMs || (sampleAge >= 30_000 && moved >= 25)) {
        await database.driverLocationSnapshot.upsert({
          where: {
            driverId_telemetryEventId: {
              driverId: telemetry.driverId,
              telemetryEventId: telemetry.eventId,
            },
          },
          update: {},
          create: {
            organizationId: telemetry.organizationId,
            driverId: telemetry.driverId,
            telemetryEventId: telemetry.eventId,
            latitude: telemetry.latitude,
            longitude: telemetry.longitude,
            accuracyM: telemetry.accuracyM ?? null,
            speedMps: telemetry.speedMps ?? null,
            headingDegrees: telemetry.headingDegrees ?? null,
            batteryPct: telemetry.batteryPct ?? null,
            observedAt: new Date(telemetry.observedAt),
            receivedAt: new Date(telemetry.receivedAt),
          },
        });
        await stateRedis.hset(sampledKey, {
          observedEpochMs: String(observedEpochMs),
          latitude: String(telemetry.latitude),
          longitude: String(telemetry.longitude),
        });
        await stateRedis.expire(sampledKey, 86_400);
      }
      await evaluateOperationalTelemetry(stateRedis, telemetry);
    }

    const envelope: Omit<RealtimeEnvelope, "cursor"> = {
      id: telemetry.eventId,
      type: "driver.location_updated",
      occurredAt: telemetry.observedAt,
      entity: { type: "driver", id: telemetry.driverId },
      payload: {
        driverId: telemetry.driverId,
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        speedMps: telemetry.speedMps,
        headingDegrees: telemetry.headingDegrees,
        observedAt: telemetry.observedAt,
      },
    };
    await stateRedis.xadd(
      streamKey(telemetry.organizationId),
      "MAXLEN",
      "~",
      50_000,
      "*",
      "payload",
      JSON.stringify(envelope),
    );
    return { ignored: false };
  },
  { connection, concurrency: 50 },
);

function simulationCredential(driverId: string) {
  return `dos_sim_${createHmac("sha256", config.SIMULATION_CREDENTIAL_SECRET)
    .update(driverId)
    .digest("base64url")}`;
}

function deterministicUuid(input: string) {
  const hex = createHash("sha256").update(input).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

async function initializeSimulation(runId: string) {
  if (!database)
    throw new Error("DATABASE_URL is required by the simulation worker");
  const run = await database.simulationRun.findUnique({
    where: { id: runId },
    include: { agents: { take: 1 } },
  });
  if (run?.status !== "RUNNING" || run.agents.length > 0) return;
  const configInput = {
    scenario: run.scenario,
    driverCount: run.driverCount as 5 | 25 | 100,
    speed: run.speed as 1 | 2 | 5 | 10,
    seed: Number(run.seed),
  };
  const agents = createSimulationAgents(configInput);
  const customer =
    (await database.customer.findFirst({
      where: { organizationId: run.organizationId },
      orderBy: { createdAt: "asc" },
    })) ??
    (await database.customer.create({
      data: {
        organizationId: run.organizationId,
        name: "Simulation recipient",
      },
    }));

  for (const agent of agents) {
    await database.$transaction(async (transaction) => {
      const driver = await transaction.driver.create({
        data: {
          organizationId: run.organizationId,
          simulationRunId: run.id,
          name: `Sim Driver ${String(agent.index + 1).padStart(3, "0")}`,
          status: "ASSIGNED",
        },
      });
      const token = simulationCredential(driver.id);
      await transaction.driverCredential.create({
        data: {
          organizationId: run.organizationId,
          driverId: driver.id,
          prefix: token.slice(0, 12),
          secretHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
        },
      });
      const row = agent.index % 10;
      const column = Math.floor(agent.index / 10);
      const pickup = {
        latitude: 51.538 + row * 0.002,
        longitude: -0.012 + column * 0.003,
      };
      const start = {
        latitude: pickup.latitude + 0.008,
        longitude: pickup.longitude - 0.01,
      };
      const dropoff = {
        latitude: 51.51 + (agent.index % 3) * 0.002,
        longitude: -0.132 + (agent.index % 4) * 0.002,
      };
      const toPickupDistance = Math.round(distanceMetres(start, pickup));
      const toDropoffDistance = Math.round(distanceMetres(pickup, dropoff));
      const delivery = await transaction.delivery.create({
        data: {
          organizationId: run.organizationId,
          customerId: customer.id,
          assignedDriverId: driver.id,
          simulationRunId: run.id,
          reference: `SIM-${run.id.slice(0, 6).toUpperCase()}-${String(agent.index + 1).padStart(3, "0")}`,
          status: "ASSIGNED",
          plannedPickupAt: new Date(),
          promisedDeliveryAt: new Date(Date.now() + 45 * 60_000),
          originalEtaAt: new Date(
            Date.now() +
              (toPickupDistance / 8.5 + 300 + toDropoffDistance / 8.5) * 1_000,
          ),
          currentEtaAt: new Date(
            Date.now() +
              (toPickupDistance / 8.5 + 300 + toDropoffDistance / 8.5) * 1_000,
          ),
          stops: {
            create: [
              {
                organizationId: run.organizationId,
                sequence: 0,
                kind: "PICKUP",
                addressLine1: `East London depot ${agent.index + 1}`,
                city: "London",
                postalCode: "E20 1EJ",
                ...pickup,
              },
              {
                organizationId: run.organizationId,
                sequence: 1,
                kind: "DROPOFF",
                addressLine1: `Central London destination ${agent.index + 1}`,
                city: "London",
                postalCode: "WC2E 8RF",
                ...dropoff,
              },
            ],
          },
          routes: {
            create: [
              {
                organizationId: run.organizationId,
                legType: "TO_PICKUP",
                version: 1,
                provider: "fixture",
                profile: "driving",
                status: "READY",
                origin: start,
                destination: pickup,
                geometry: {
                  type: "LineString",
                  coordinates: [
                    [start.longitude, start.latitude],
                    [pickup.longitude, pickup.latitude],
                  ],
                },
                distanceM: toPickupDistance,
                durationSeconds: Math.max(
                  60,
                  Math.round(toPickupDistance / 8.5),
                ),
                calculationReason: "simulation.initial",
                calculatedAt: new Date(),
              },
              {
                organizationId: run.organizationId,
                legType: "TO_DROPOFF",
                version: 1,
                provider: "fixture",
                profile: "driving",
                status: "READY",
                origin: pickup,
                destination: dropoff,
                geometry: {
                  type: "LineString",
                  coordinates: [
                    [pickup.longitude, pickup.latitude],
                    [dropoff.longitude, dropoff.latitude],
                  ],
                },
                distanceM: toDropoffDistance,
                durationSeconds: Math.max(
                  60,
                  Math.round(toDropoffDistance / 8.5),
                ),
                calculationReason: "simulation.initial",
                calculatedAt: new Date(),
              },
            ],
          },
        },
      });
      await transaction.deliveryAssignment.create({
        data: {
          organizationId: run.organizationId,
          deliveryId: delivery.id,
          driverId: driver.id,
        },
      });
      await transaction.simulationAgent.create({
        data: {
          simulationRunId: run.id,
          driverId: driver.id,
          currentDeliveryId: delivery.id,
          phase: "ASSIGNED",
          randomState: BigInt((Number(run.seed) + agent.index + 1) >>> 0),
          nextActionAtMs: BigInt(agent.startDelaySeconds * 1_000),
          exceptionFlags: {
            exception: agent.exception,
            speedMps: agent.speedMps,
          },
        },
      });
      for (const eventType of ["delivery.created", "delivery.assigned"]) {
        const event = await transaction.domainEvent.create({
          data: {
            organizationId: run.organizationId,
            aggregateType: "DELIVERY",
            aggregateId: delivery.id,
            deliveryId: delivery.id,
            driverId: driver.id,
            eventType,
            actorType: "SIMULATOR",
            actorId: run.id,
            metadata: { simulationRunId: run.id },
          },
        });
        await transaction.outboxEvent.create({
          data: { organizationId: run.organizationId, domainEventId: event.id },
        });
      }
    });
  }
}

const lifecycleCommands: Record<string, { slug: string; body?: object }> = {
  ASSIGNED: { slug: "accept" },
  ACCEPTED: { slug: "start-pickup" },
  EN_ROUTE_TO_PICKUP: { slug: "arrive-pickup" },
  ARRIVED_PICKUP: { slug: "confirm-pickup" },
  PICKED_UP: { slug: "depart-pickup" },
  EN_ROUTE_TO_DROPOFF: { slug: "arrive-dropoff" },
  ARRIVED_DROPOFF: {
    slug: "complete",
    body: { recipientName: "Simulation recipient", note: "Fixture proof" },
  },
};

async function simulationRequest(
  driverId: string,
  path: string,
  body: object,
  idempotencyKey?: string,
) {
  const response = await fetch(`${config.WEB_ORIGIN}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${simulationCredential(driverId)}`,
      "content-type": "application/json",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Simulation HTTP request failed (${response.status}): ${error.slice(0, 200)}`,
    );
  }
  return response;
}

async function tickSimulation(runId: string) {
  if (!database)
    throw new Error("DATABASE_URL is required by the simulation worker");
  const run = await database.simulationRun.findUnique({
    where: { id: runId },
    include: {
      agents: {
        include: {
          currentDelivery: {
            include: { stops: { orderBy: { sequence: "asc" } } },
          },
        },
        orderBy: { driverId: "asc" },
      },
    },
  });
  if (run?.status !== "RUNNING") return;
  let completed = 0;
  for (const agent of run.agents) {
    if (run.logicalTimeMs < agent.nextActionAtMs) continue;
    const delivery = agent.currentDelivery;
    if (
      !delivery ||
      ["DELIVERED", "FAILED", "RETURN_REQUIRED"].includes(delivery.status)
    ) {
      completed += 1;
      continue;
    }
    const sequence = agent.telemetrySequence + 1;
    const pickup = delivery.stops[0];
    const dropoff = delivery.stops[1];
    if (!pickup || !dropoff)
      throw new Error("Simulation delivery is missing stops");
    const flags = agent.exceptionFlags as {
      exception?: string;
      speedMps?: number;
    };
    const trafficFactor = flags.exception === "TRAFFIC" ? 0.55 : 1;
    const progress = Math.min(1, (sequence / 12) * trafficFactor);
    const deviation =
      flags.exception === "DEVIATION" && sequence >= 5 && sequence <= 8
        ? 0.003
        : 0;
    const latitude =
      Number(pickup.latitude) +
      (Number(dropoff.latitude) - Number(pickup.latitude)) * progress +
      deviation;
    const longitude =
      Number(pickup.longitude) +
      (Number(dropoff.longitude) - Number(pickup.longitude)) * progress;
    const suppressTelemetry =
      flags.exception === "OFFLINE" && sequence >= 4 && sequence <= 8;
    if (!suppressTelemetry) {
      await simulationRequest(agent.driverId, "/api/v1/telemetry", {
        eventId: deterministicUuid(`${run.id}:${agent.driverId}:${sequence}`),
        driverId: agent.driverId,
        deviceSessionId: `simulation-${run.id}`,
        sequence,
        observedAt: new Date().toISOString(),
        latitude,
        longitude,
        accuracyM: 8,
        speedMps: flags.speedMps ?? 9,
        headingDegrees: 115,
        batteryPct: Math.max(20, 100 - sequence),
      });
    }
    const shouldFail =
      flags.exception === "FAILED_DELIVERY" &&
      ["ACCEPTED", "EN_ROUTE_TO_PICKUP", "ARRIVED_PICKUP"].includes(
        delivery.status,
      ) &&
      sequence >= 4;
    const lifecycle = shouldFail
      ? { slug: "fail", body: { reason: "Deterministic simulated exception" } }
      : lifecycleCommands[delivery.status];
    if (lifecycle) {
      await simulationRequest(
        agent.driverId,
        `/api/v1/organizations/${run.organizationId}/deliveries/${delivery.id}/commands/${lifecycle.slug}`,
        lifecycle.body ?? {},
        `sim-${run.id}-${delivery.id}-${lifecycle.slug}`,
      );
    }
    await database.simulationAgent.update({
      where: { id: agent.id },
      data: {
        telemetrySequence: sequence,
        routePositionM:
          progress *
          distanceMetres(
            {
              latitude: Number(pickup.latitude),
              longitude: Number(pickup.longitude),
            },
            {
              latitude: Number(dropoff.latitude),
              longitude: Number(dropoff.longitude),
            },
          ),
        phase: shouldFail
          ? "FAILED"
          : lifecycle?.slug === "complete"
            ? "COMPLETED"
            : delivery.status,
        nextActionAtMs: BigInt(Number(run.logicalTimeMs) + 5_000),
      },
    });
    if (shouldFail || lifecycle?.slug === "complete") completed += 1;
  }
  const logicalTimeMs = run.logicalTimeMs + BigInt(5_000 * run.speed);
  if (
    shouldCompleteSimulation(
      completed,
      run.agents.length,
      run.driverCount,
      Number(logicalTimeMs),
    )
  ) {
    await database.$transaction(async (transaction) => {
      await transaction.simulationRun.update({
        where: { id: run.id },
        data: { status: "COMPLETED", logicalTimeMs },
      });
      const event = await transaction.domainEvent.create({
        data: {
          organizationId: run.organizationId,
          aggregateType: "SIMULATION",
          aggregateId: run.id,
          eventType: "simulation.completed",
          actorType: "SIMULATOR",
          actorId: run.id,
          metadata: { driverCount: run.driverCount },
        },
      });
      await transaction.outboxEvent.create({
        data: { organizationId: run.organizationId, domainEventId: event.id },
      });
    });
    return;
  }
  await database.simulationRun.update({
    where: { id: run.id },
    data: { logicalTimeMs },
  });
  await simulationQueue.add(
    "simulation-tick",
    { action: "tick", organizationId: run.organizationId, runId: run.id },
    {
      jobId: `simulation-${run.id}-tick-${logicalTimeMs}`,
      delay: Math.max(500, Math.floor(5_000 / run.speed)),
      removeOnComplete: { age: 86_400, count: 5_000 },
      removeOnFail: { age: 604_800 },
      attempts: 3,
      backoff: { type: "exponential", delay: 1_000 },
    },
  );
}

const simulationWorker = new Worker<SimulationJob>(
  "simulation",
  async (job) => {
    if (job.data.action === "start") await initializeSimulation(job.data.runId);
    if (["start", "resume", "tick"].includes(job.data.action))
      await tickSimulation(job.data.runId);
  },
  { connection: createRedis(), concurrency: 1 },
);

async function publishOutboxBatch() {
  if (!database) return;
  await database.$transaction(async (transaction) => {
    const claimed = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "OutboxEvent"
      WHERE status = 'PENDING' AND "availableAt" <= now()
      ORDER BY "availableAt", id
      FOR UPDATE SKIP LOCKED
      LIMIT 100
    `;
    if (claimed.length === 0) return;
    const outboxRows = await transaction.outboxEvent.findMany({
      where: { id: { in: claimed.map(({ id }) => id) } },
      include: { domainEvent: true },
      orderBy: { availableAt: "asc" },
    });
    for (const outbox of outboxRows) {
      const event = outbox.domainEvent;
      const entityType = event.aggregateType.toLowerCase() as
        | "delivery"
        | "driver"
        | "alert"
        | "simulation";
      const envelope: Omit<RealtimeEnvelope, "cursor"> = {
        id: event.id,
        type: event.eventType,
        occurredAt: event.occurredAt.toISOString(),
        entity: { type: entityType, id: event.aggregateId },
        payload: event.metadata,
      };
      await stateRedis.xadd(
        streamKey(event.organizationId),
        "MAXLEN",
        "~",
        50_000,
        "*",
        "payload",
        JSON.stringify(envelope),
      );
      await transaction.outboxEvent.update({
        where: { id: outbox.id },
        data: {
          status: "PUBLISHED",
          attempts: { increment: 1 },
          publishedAt: new Date(),
          lastError: null,
        },
      });
    }
  });
}

let publishing = false;
const outboxPoller = setInterval(() => {
  if (publishing) return;
  publishing = true;
  void publishOutboxBatch()
    .catch((error) =>
      console.error("outbox_publish_failed", {
        error: error instanceof Error ? error.message : "unknown",
      }),
    )
    .finally(() => {
      publishing = false;
    });
}, 1_000);

telemetryWorker.on("failed", (job, error) =>
  console.error("telemetry_failed", { jobId: job?.id, error: error.message }),
);

const heartbeat = setInterval(() => {
  void stateRedis.set(
    "deliveryos:worker:heartbeat",
    new Date().toISOString(),
    "EX",
    60,
  );
}, 15_000);

let evaluatingPresence = false;
const presencePoller = setInterval(() => {
  if (evaluatingPresence) return;
  evaluatingPresence = true;
  void evaluateDriverPresence(stateRedis)
    .catch((error) =>
      console.error("presence_evaluation_failed", {
        error: error instanceof Error ? error.message : "unknown",
      }),
    )
    .finally(() => {
      evaluatingPresence = false;
    });
}, 30_000);

let retaining = false;
const retentionPoller = setInterval(() => {
  if (retaining) return;
  retaining = true;
  void runTelemetryRetention()
    .then((result) => {
      if (result.downsampled || result.purged)
        console.info("telemetry_retention", result);
    })
    .catch((error) => {
      observability.captureException(error, { job: "retention" });
      console.error("telemetry_retention_failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
    })
    .finally(() => {
      retaining = false;
    });
}, 60 * 60_000);

async function shutdown() {
  clearInterval(heartbeat);
  clearInterval(outboxPoller);
  clearInterval(presencePoller);
  clearInterval(retentionPoller);
  await Promise.all([telemetryWorker.close(), simulationWorker.close()]);
  await stateRedis.quit();
  connection.disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
console.info("deliveryos_worker_started", {
  redis: new URL(config.REDIS_URL).host,
});
