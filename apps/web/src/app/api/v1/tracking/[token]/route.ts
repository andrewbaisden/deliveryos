import { createHash } from "node:crypto";
import { database } from "@deliveryos/database/client";
import { customerEtaWindow, distanceMetres } from "@deliveryos/domain";
import { ApiError, apiError } from "@/lib/api";
import { ensureRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    if (!database)
      throw new ApiError(
        503,
        "SERVICE_UNAVAILABLE",
        "Database is not configured",
      );
    const { token } = await params;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const redis = await ensureRedis();
    const ip =
      _request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 16);
    const rateKey = `deliveryos:rate:tracking:${tokenHash}:${ipHash}:${Math.floor(Date.now() / 60_000)}`;
    const rate = await redis.incr(rateKey);
    if (rate === 1) await redis.expire(rateKey, 120);
    if (rate > 60)
      throw new ApiError(429, "RATE_LIMITED", "Tracking rate limit exceeded");
    const tracking = await database.trackingToken.findUnique({
      where: { tokenHash },
      include: {
        delivery: {
          include: {
            assignedDriver: true,
            stops: { orderBy: { sequence: "asc" } },
          },
        },
      },
    });
    if (!tracking || tracking.revokedAt || tracking.expiresAt < new Date())
      throw new ApiError(404, "NOT_FOUND", "Tracking link not found");
    const delivery = tracking.delivery;
    const eta = delivery.currentEtaAt ?? delivery.originalEtaAt;
    let approximateLocation: {
      latitude: number;
      longitude: number;
      observedAt: string;
    } | null = null;
    if (
      delivery.assignedDriverId &&
      ["EN_ROUTE_TO_DROPOFF", "ARRIVED_DROPOFF"].includes(delivery.status)
    ) {
      const location = await redis.hgetall(
        `deliveryos:org:${delivery.organizationId}:driver:${delivery.assignedDriverId}:location`,
      );
      const dropoff = [...delivery.stops]
        .reverse()
        .find((stop) => stop.kind === "DROPOFF");
      if (
        location.latitude &&
        location.longitude &&
        location.observedAt &&
        dropoff &&
        distanceMetres(
          {
            latitude: Number(location.latitude),
            longitude: Number(location.longitude),
          },
          {
            latitude: Number(dropoff.latitude),
            longitude: Number(dropoff.longitude),
          },
        ) <= 1_000
      ) {
        approximateLocation = {
          latitude: Number(Number(location.latitude).toFixed(3)),
          longitude: Number(Number(location.longitude).toFixed(3)),
          observedAt: new Date(
            Math.floor(new Date(location.observedAt).getTime() / 30_000) *
              30_000,
          ).toISOString(),
        };
      }
    }
    await database.trackingToken.update({
      where: { id: tracking.id },
      data: { lastViewedAt: new Date() },
    });
    return Response.json(
      {
        data: {
          reference: delivery.reference,
          status: delivery.status,
          progressText:
            delivery.status === "DELIVERED"
              ? "Delivered"
              : delivery.status === "EN_ROUTE_TO_DROPOFF"
                ? "On the way to you"
                : delivery.status === "ARRIVED_DROPOFF"
                  ? "Your driver has arrived"
                  : "Delivery is being prepared",
          etaWindow: eta
            ? Object.fromEntries(
                Object.entries(customerEtaWindow(eta)).map(([key, value]) => [
                  key,
                  value.toISOString(),
                ]),
              )
            : null,
          driver: delivery.assignedDriver
            ? { displayName: delivery.assignedDriver.name.split(" ")[0] }
            : null,
          approximateLocation,
        },
        meta: { requestId },
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
