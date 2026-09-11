type CaptureContext = Record<string, unknown>;

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== "object") return value;
  const blocked = new Set([
    "latitude",
    "longitude",
    "token",
    "password",
    "address",
    "email",
    "phone",
    "secret",
    "authorization",
  ]);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      blocked.has(key.toLowerCase()) ? "[redacted]" : scrub(nested),
    ]),
  );
}

export const observability = {
  captureException(error: unknown, context?: CaptureContext) {
    if (!process.env.SENTRY_DSN) return;
    console.error("sentry_capture", {
      message: error instanceof Error ? error.message : String(error),
      context: context ? scrub(context) : undefined,
    });
  },
  captureEvent(name: string, properties?: CaptureContext) {
    if (!process.env.POSTHOG_KEY) return;
    console.info("posthog_capture", {
      name,
      properties: properties ? scrub(properties) : undefined,
    });
  },
};
