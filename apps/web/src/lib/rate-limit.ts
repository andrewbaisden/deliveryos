import type IORedis from "ioredis";
import { ApiError } from "./api";

export async function enforceRateLimit(
  redis: IORedis,
  scope: string,
  limit: number,
) {
  const key = `deliveryos:rate:${scope}:${Math.floor(Date.now() / 60_000)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 120);
  if (count > limit)
    throw new ApiError(429, "RATE_LIMITED", "Rate limit exceeded");
}
