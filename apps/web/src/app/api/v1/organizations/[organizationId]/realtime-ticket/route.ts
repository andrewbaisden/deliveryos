import { randomBytes } from "node:crypto";
import { apiError, assertTrustedOrigin, requireMembership } from "@/lib/api";
import { publicEnv } from "@/lib/public-env";
import { ensureRedis } from "@/lib/redis";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    assertTrustedOrigin(request.headers);
    const { organizationId } = await params;
    const { session } = await requireMembership(
      request.headers,
      organizationId,
      ["ADMIN", "DISPATCHER"],
    );
    const token = randomBytes(32).toString("base64url");
    const redis = await ensureRedis();
    await redis.set(
      `deliveryos:stream-ticket:${token}`,
      JSON.stringify({ organizationId, userId: session.user.id }),
      "EX",
      60,
    );
    return Response.json({
      data: {
        token,
        streamUrl: `${publicEnv.runtimeUrl}/v1/stream`,
        expiresInSeconds: 60,
      },
      meta: { requestId },
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
