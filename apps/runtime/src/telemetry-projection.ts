import type { TelemetryJob } from "./queues";
import type { createRedis } from "./redis";

type Redis = ReturnType<typeof createRedis>;

export const updateLatestLocationScript = `
local previous = redis.call("HGET", KEYS[1], "observedEpochMs")
if previous and tonumber(previous) >= tonumber(ARGV[1]) then
  return 0
end
redis.call("HSET", KEYS[1],
  "observedEpochMs", ARGV[1],
  "observedAt", ARGV[2],
  "receivedAt", ARGV[3],
  "latitude", ARGV[4],
  "longitude", ARGV[5],
  "speedMps", ARGV[6],
  "headingDegrees", ARGV[7],
  "batteryPct", ARGV[8])
redis.call("EXPIRE", KEYS[1], 600)
return 1
`;

export async function setLatestLocation(
  redis: Redis,
  key: string,
  telemetry: TelemetryJob,
) {
  const observedEpochMs = new Date(telemetry.observedAt).getTime();
  const updated = await redis.eval(
    updateLatestLocationScript,
    1,
    key,
    String(observedEpochMs),
    telemetry.observedAt,
    telemetry.receivedAt,
    String(telemetry.latitude),
    String(telemetry.longitude),
    String(telemetry.speedMps ?? ""),
    String(telemetry.headingDegrees ?? ""),
    String(telemetry.batteryPct ?? ""),
  );
  return Number(updated) === 1;
}
