import { database } from "@deliveryos/database/client";
import { ApiError, apiError } from "@/lib/api";
import { auth } from "@/lib/auth";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    if (!database)
      throw new ApiError(
        503,
        "SERVICE_UNAVAILABLE",
        "Database is not configured",
      );
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session)
      throw new ApiError(401, "AUTH_REQUIRED", "Sign in is required");
    const membership = await database.membership.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
    });
    if (!membership)
      throw new ApiError(404, "NOT_FOUND", "Membership not found");
    return Response.json({
      data: {
        user: { id: session.user.id, name: session.user.name },
        organizationId: membership.organizationId,
        role: membership.role,
        home: membership.role === "DRIVER" ? "/driver" : "/ops",
      },
      meta: { requestId },
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
