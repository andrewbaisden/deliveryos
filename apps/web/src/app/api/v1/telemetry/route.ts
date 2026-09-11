import { createHash } from "node:crypto";
import {
  telemetryBatchSchema,
  validateTelemetryTime,
} from "@deliveryos/contracts";
import { database } from "@deliveryos/database/client";
import { ApiError, apiError, assertTrustedOrigin } from "@/lib/api";
import { auth } from "@/lib/auth";
import { ensureRedis, telemetryQueue } from "@/lib/redis";
import { claimTelemetrySequence } from "@/lib/telemetry-sequence";

async function resolveIdentity(request: Request) {
  if (!database)
    throw new ApiError(
      503,
      "SERVICE_UNAVAILABLE",
      "Database is not configured",
    );
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (bearer) {
    const prefix = bearer.slice(0, 12);
    const credential = await database.driverCredential.findUnique({
      where: { prefix },
      include: { driver: true },
    });
    const secretHash = createHash("sha256").update(bearer).digest("hex");
    if (
      !credential ||
      credential.secretHash !== secretHash ||
      credential.revokedAt ||
      (credential.expiresAt && credential.expiresAt < new Date())
    )
      throw new ApiError(401, "AUTH_REQUIRED", "Invalid driver credential");
    return {
      organizationId: credential.organizationId,
      driverId: credential.driverId,
    };
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    throw new ApiError(
      401,
      "AUTH_REQUIRED",
      "Driver authentication is required",
    );
  const driver = await database.driver.findUnique({
    where: { userId: session.user.id },
  });
  if (!driver)
    throw new ApiError(
      403,
      "FORBIDDEN",
      "No driver profile is linked to this user",
    );
  return { organizationId: driver.organizationId, driverId: driver.id };
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    assertTrustedOrigin(request.headers);
    const identity = await resolveIdentity(request);
    const parsed = telemetryBatchSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiError(
        422,
        "VALIDATION_FAILED",
        "Telemetry payload is invalid",
        parsed.error.flatten(),
      );
    if (parsed.data.some((event) => event.driverId !== identity.driverId))
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Telemetry driver does not match the authenticated identity",
      );
    const invalidTime = parsed.data.find(
      (event) => validateTelemetryTime(event.observedAt) !== "valid",
    );
    if (invalidTime)
      throw new ApiError(
        422,
        "TELEMETRY_STALE",
        "Telemetry timestamp is outside the accepted window",
      );

    const redis = await ensureRedis();
    const rateKey = `deliveryos:rate:telemetry:${identity.driverId}:${Math.floor(Date.now() / 60_000)}`;
    const count = await redis.incrby(rateKey, parsed.data.length);
    if (count === parsed.data.length) await redis.expire(rateKey, 120);
    if (count > 120)
      throw new ApiError(429, "RATE_LIMITED", "Telemetry rate limit exceeded");

    let accepted = 0;
    let duplicate = 0;
    let rejected = 0;
    for (const event of parsed.data) {
      const dedupeKey = `deliveryos:telemetry:dedupe:${event.eventId}`;
      if (!(await redis.set(dedupeKey, "1", "EX", 86_400, "NX"))) {
        duplicate += 1;
        continue;
      }
      const deviceFingerprint = createHash("sha256")
        .update(event.deviceSessionId)
        .digest("hex")
        .slice(0, 24);
      const sequenceKey = `deliveryos:telemetry:sequence:${identity.driverId}:${deviceFingerprint}`;
      if (!(await claimTelemetrySequence(redis, sequenceKey, event.sequence))) {
        await redis.del(dedupeKey);
        rejected += 1;
        continue;
      }
      try {
        await telemetryQueue.add(
          "process-location",
          { ...event, ...identity, receivedAt: new Date().toISOString() },
          {
            jobId: event.eventId,
            attempts: 5,
            backoff: { type: "exponential", delay: 250 },
            removeOnComplete: { age: 86_400, count: 10_000 },
            removeOnFail: { age: 604_800 },
          },
        );
        accepted += 1;
      } catch (error) {
        await redis.del(dedupeKey);
        throw error;
      }
    }
    return Response.json(
      { data: { accepted, duplicate, rejected }, meta: { requestId } },
      { status: 202 },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
