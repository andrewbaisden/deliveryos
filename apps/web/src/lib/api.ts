import type { MembershipRole } from "@deliveryos/database";
import { database } from "@deliveryos/database/client";
import { auth } from "./auth";
import { serverEnv } from "./env";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function apiError(
  error: unknown,
  requestId = crypto.randomUUID(),
): Response {
  if (error instanceof ApiError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId,
        },
      },
      { status: error.status },
    );
  }
  const errorCode =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
  if (errorCode === "INVALID_TRANSITION")
    return Response.json(
      {
        error: {
          code: "INVALID_TRANSITION",
          message:
            error instanceof Error ? error.message : "Invalid transition",
          requestId,
        },
      },
      { status: 409 },
    );
  if (errorCode === "P2002")
    return Response.json(
      {
        error: {
          code: "ASSIGNMENT_CONFLICT",
          message: "The operation conflicts with a concurrent change",
          requestId,
        },
      },
      { status: 409 },
    );
  console.error("api_request_failed", { requestId, error });
  return Response.json(
    {
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "The operation could not be completed",
        requestId,
      },
    },
    { status: 503 },
  );
}

export function assertTrustedOrigin(headers: Headers) {
  const origin = headers.get("origin");
  if (!origin) return;
  if (origin !== new URL(serverEnv.BETTER_AUTH_URL).origin)
    throw new ApiError(403, "FORBIDDEN", "Request origin is not allowed");
}

export async function requireMembership(
  headers: Headers,
  organizationId: string,
  roles?: MembershipRole[],
) {
  if (!database)
    throw new ApiError(
      503,
      "SERVICE_UNAVAILABLE",
      "Database is not configured",
    );
  const session = await auth.api.getSession({ headers });
  if (!session) throw new ApiError(401, "AUTH_REQUIRED", "Sign in is required");
  const membership = await database.membership.findUnique({
    where: {
      organizationId_userId: { organizationId, userId: session.user.id },
    },
  });
  if (!membership)
    throw new ApiError(404, "NOT_FOUND", "Organisation not found");
  if (roles && !roles.includes(membership.role))
    throw new ApiError(
      403,
      "FORBIDDEN",
      "This role cannot perform that operation",
    );
  return { session, membership, database };
}

export function requireIdempotencyKey(headers: Headers): string {
  const key = headers.get("idempotency-key")?.trim();
  if (!key || key.length > 200)
    throw new ApiError(
      422,
      "VALIDATION_FAILED",
      "A valid Idempotency-Key header is required",
    );
  return key;
}
