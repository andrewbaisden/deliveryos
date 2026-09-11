import type IORedis from "ioredis";

const claimSequenceScript = `
local previous = redis.call("GET", KEYS[1])
if previous and tonumber(previous) >= tonumber(ARGV[1]) then
  return 0
end
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
return 1
`;

export async function claimTelemetrySequence(
  redis: IORedis,
  key: string,
  sequence: number,
) {
  const claimed = await redis.eval(
    claimSequenceScript,
    1,
    key,
    String(sequence),
    "86400",
  );
  return Number(claimed) === 1;
}
