import { createHash } from "node:crypto";
import { simulationConfigSchema } from "@deliveryos/contracts";
import {
  ApiError,
  apiError,
  assertTrustedOrigin,
  requireIdempotencyKey,
  requireMembership,
} from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ensureRedis, simulationQueue } from "@/lib/redis";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    assertTrustedOrigin(request.headers);
    const { organizationId } = await params;
    const key = requireIdempotencyKey(request.headers);
    const config = simulationConfigSchema.safeParse(await request.json());
    if (!config.success)
      throw new ApiError(
        422,
        "VALIDATION_FAILED",
        "Simulation configuration is invalid",
        config.error.flatten(),
      );
    const { database, session } = await requireMembership(
      request.headers,
      organizationId,
      ["ADMIN"],
    );
    const redis = await ensureRedis();
    await enforceRateLimit(redis, `simulation:${session.user.id}`, 10);
    const requestHash = createHash("sha256")
      .update(JSON.stringify(config.data))
      .digest("hex");
    const previous = await database.idempotencyRecord.findUnique({
      where: {
        organizationId_actorFingerprint_key: {
          organizationId,
          actorFingerprint: session.user.id,
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
        status: previous.responseStatus ?? 201,
      });
    }

    const responseBody = await database.$transaction(
      async (transaction) => {
        const active = await transaction.simulationRun.findFirst({
          where: { organizationId, status: { in: ["RUNNING", "PAUSED"] } },
        });
        if (active)
          throw new ApiError(
            409,
            "ASSIGNMENT_CONFLICT",
            "An active simulation already exists",
          );
        const run = await transaction.simulationRun.create({
          data: {
            organizationId,
            scenario: config.data.scenario,
            scenarioVersion: 1,
            seed: BigInt(config.data.seed),
            driverCount: config.data.driverCount,
            speed: config.data.speed,
            status: "RUNNING",
            startedAt: new Date(),
          },
        });
        const event = await transaction.domainEvent.create({
          data: {
            organizationId,
            aggregateType: "SIMULATION",
            aggregateId: run.id,
            eventType: "simulation.started",
            actorType: "USER",
            actorId: session.user.id,
            idempotencyKey: key,
            metadata: config.data,
          },
        });
        await transaction.outboxEvent.create({
          data: { organizationId, domainEventId: event.id },
        });
        const body = {
          data: {
            id: run.id,
            status: run.status,
            scenario: run.scenario,
            scenarioVersion: run.scenarioVersion,
            seed: Number(run.seed),
            driverCount: run.driverCount,
            speed: run.speed,
          },
          meta: { requestId },
        };
        await transaction.idempotencyRecord.create({
          data: {
            organizationId,
            actorFingerprint: session.user.id,
            key,
            operation: "simulation.start",
            requestHash,
            responseStatus: 201,
            responseBody: body,
            expiresAt: new Date(Date.now() + 30 * 86_400_000),
          },
        });
        return body;
      },
      { isolationLevel: "Serializable" },
    );

    try {
      await simulationQueue.add(
        "simulation-start",
        {
          action: "start",
          organizationId,
          runId: responseBody.data.id,
        },
        {
          jobId: `simulation-${responseBody.data.id}-start`,
          attempts: 3,
          backoff: { type: "exponential", delay: 1_000 },
        },
      );
    } catch (error) {
      await database.simulationRun.update({
        where: { id: responseBody.data.id },
        data: { status: "FAILED" },
      });
      throw error;
    }
    return Response.json(responseBody, { status: 201 });
  } catch (error) {
    return apiError(error, requestId);
  }
}
