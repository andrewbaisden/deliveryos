export function humanise(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

export function statusTone(value: string): string {
  if (["LIVE", "ON_TIME", "AVAILABLE", "DELIVERED"].includes(value))
    return "positive";
  if (["AT_RISK", "RECENT", "ASSIGNED", "ON_BREAK"].includes(value))
    return "warning";
  if (["DELAYED", "STALE", "OFFLINE", "FAILED"].includes(value))
    return "danger";
  return "neutral";
}
