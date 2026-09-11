import "./load-env";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import { config } from "./config";
import { createRedis, streamKey } from "./redis";
import { compareStreamIds } from "./stream";

const app = Fastify({ logger: true });
await app.register(cors, { origin: config.WEB_ORIGIN, credentials: false });

app.get("/health/live", async () => ({ status: "ok" }));
app.get("/health/ready", async (_request, reply) => {
  const redis = createRedis();
  try {
    await redis.connect();
    await redis.ping();
    return { status: "ready" };
  } catch {
    return reply.code(503).send({ status: "unavailable" });
  } finally {
    redis.disconnect();
  }
});

const streamQuerySchema = z.object({
  ticket: z.string().min(32).max(256),
  cursor: z
    .string()
    .regex(/^(0|\d+-\d+)$/)
    .default("0"),
});

app.get("/v1/stream", async (request, reply) => {
  const parsed = streamQuerySchema.safeParse(request.query);
  if (!parsed.success)
    return reply.code(400).send({ error: "invalid_stream_request" });

  const redis = createRedis();
  await redis.connect();
  const ticketPayload = await redis.getdel(
    `deliveryos:stream-ticket:${parsed.data.ticket}`,
  );
  if (!ticketPayload) {
    redis.disconnect();
    return reply.code(401).send({ error: "expired_stream_ticket" });
  }

  const ticket = z
    .object({ organizationId: z.string().uuid(), userId: z.string().uuid() })
    .safeParse(JSON.parse(ticketPayload));
  if (!ticket.success) {
    redis.disconnect();
    return reply.code(401).send({ error: "invalid_stream_ticket" });
  }

  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let cursor = parsed.data.cursor;
  if (cursor !== "0") {
    const earliest = await redis.xrange(
      streamKey(ticket.data.organizationId),
      "-",
      "+",
      "COUNT",
      1,
    );
    if (earliest[0] && compareStreamIds(cursor, earliest[0][0]) < 0) {
      reply.raw.write(
        `event: stream.reset\ndata: ${JSON.stringify({ reason: "cursor_expired" })}\n\n`,
      );
      reply.raw.end();
      redis.disconnect();
      return;
    }
  }
  let closed = false;
  const heartbeat = setInterval(
    () => reply.raw.write(": heartbeat\n\n"),
    15_000,
  );
  request.raw.on("close", () => {
    closed = true;
    clearInterval(heartbeat);
    redis.disconnect();
  });

  while (!closed) {
    const rows = await redis.xread(
      "COUNT",
      100,
      "BLOCK",
      10_000,
      "STREAMS",
      streamKey(ticket.data.organizationId),
      cursor,
    );
    if (!rows) continue;
    for (const [, entries] of rows) {
      for (const [id, fields] of entries) {
        cursor = id;
        const payloadIndex = fields.indexOf("payload");
        const payload = payloadIndex >= 0 ? fields[payloadIndex + 1] : "{}";
        const envelope = { ...JSON.parse(payload ?? "{}"), cursor: id };
        reply.raw.write(
          `id: ${id}\nevent: update\ndata: ${JSON.stringify(envelope)}\n\n`,
        );
      }
    }
  }
});

await app.listen({ port: config.PORT, host: config.HOST });
