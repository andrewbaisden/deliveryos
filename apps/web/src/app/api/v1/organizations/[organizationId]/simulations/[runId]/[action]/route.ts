import { createHash } from "node:crypto";
import {
  ApiError,
  apiError,
  assertTrustedOrigin,
  requireIdempotencyKey,
  requireMembership,
} from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ensureRedis, simulationQueue } from "@/lib/redis";

const actions = ["pause", "resume", "stop", "reset"] as const;
type Action = (typeof actions)[number];
const eventTypes: Record<Action, string> = {
  pause: "simulation.paused",
  resume: "simulation.started",
  stop: "simulation.stopped",
  reset: "simulation.stopped",
};

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ organizationId: string; runId: string; action: string }>;
  },
) {
  const requestId = crypto.randomUUID();
  try {
    assertTrustedOrigin(request.headers);
    const { organizationId, runId, action: rawAction } = await params;
    if (!actions.includes(rawAction as Action))
      throw new ApiError(404, "NOT_FOUND", "Simulation command not found");
    const action = rawAction as Action;
    const key = requireIdempotencyKey(request.headers);
    const { database, session } = await requireMembership(
      request.headers,
      organizationId,
      ["ADMIN"],
    );
    const redis = await ensureRedis();
    await enforceRateLimit(redis, `simulation:${session.user.id}`, 10);
    const requestHash = createHash("sha256")
      .update(`${runId}:${action}`)
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
        status: previous.responseStatus ?? 200,
      });
    }

    const responseBody = await database.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM "SimulationRun" WHERE id = ${runId}::uuid AND "organizationId" = ${organizationId}::uuid FOR UPDATE`;
        const run = await transaction.simulationRun.findFirst({
          where: { id: runId, organizationId },
        });
        if (!run) throw new ApiError(404, "NOT_FOUND", "Simulation not found");
        const allowed =
          (action === "pause" && run.status === "RUNNING") ||
          (action === "resume" && run.status === "PAUSED") ||
          (action === "stop" && ["RUNNING", "PAUSED"].includes(run.status)) ||
          action === "reset";
        if (!allowed)
          throw new ApiError(
            409,
            "INVALID_TRANSITION",
            `Cannot ${action} a ${run.status.toLowerCase()} simulation`,
          );

        let status: string = run.status;
        if (action === "reset") {
          await transaction.simulationRun.update({
            where: { id: run.id },
            data: { status: "STOPPED", stoppedAt: new Date() },
          });
          await transaction.deliveryAssignment.deleteMany({
            where: {
              organizationId,
              OR: [
                { delivery: { simulationRunId: run.id } },
                { driver: { simulationRunId: run.id } },
              ],
            },
          });
          await transaction.delivery.deleteMany({
            where: { organizationId, simulationRunId: run.id },
          });
          await transaction.driver.deleteMany({
            where: { organizationId, simulationRunId: run.id },
          });
          await transaction.simulationRun.delete({ where: { id: run.id } });
          status = "RESET";
        } else {
          const nextStatus =
            action === "pause"
              ? "PAUSED"
              : action === "resume"
                ? "RUNNING"
                : "STOPPED";
          const updated = await transaction.simulationRun.update({
            where: { id: run.id },
            data: {
              status: nextStatus,
              ...(action === "pause" ? { pausedAt: new Date() } : {}),
              ...(action === "resume" ? { pausedAt: null } : {}),
              ...(action === "stop" ? { stoppedAt: new Date() } : {}),
            },
          });
          status = updated.status;
        }
        const event = await transaction.domainEvent.create({
          data: {
            organizationId,
            aggregateType: "SIMULATION",
            aggregateId: run.id,
            eventType: eventTypes[action],
            actorType: "USER",
            actorId: session.user.id,
            idempotencyKey: key,
            metadata: { action },
          },
        });
        await transaction.outboxEvent.create({
          data: { organizationId, domainEventId: event.id },
        });
        const body = { data: { id: run.id, status }, meta: { requestId } };
        await transaction.idempotencyRecord.create({
          data: {
            organizationId,
            actorFingerprint: session.user.id,
            key,
            operation: `simulation.${action}`,
            requestHash,
            responseStatus: 200,
            responseBody: body,
            expiresAt: new Date(Date.now() + 30 * 86_400_000),
          },
        });
        return body;
      },
      { isolationLevel: "Serializable" },
    );

    await simulationQueue.add(
      `simulation-${action}`,
      { action, organizationId, runId },
      {
        jobId: `simulation-${runId}-${action}-${key.replaceAll(":", "-")}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
      },
    );
    return Response.json(responseBody);
  } catch (error) {
    return apiError(error, requestId);
  }
}
