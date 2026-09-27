# Specification

Engineering scope for DeliveryOS: what the product covers, how the repository is laid out, the environment, the quality gates, and the intended deployment.

How to run the app is in [README.md](./README.md). System design is in [ARCHITECTURE.md](./ARCHITECTURE.md). The decision log is in [DECISIONS.md](./DECISIONS.md).

## Scope

DeliveryOS is a last-mile operations platform. PostgreSQL is the authority for delivery state, assignments, events, tokens, and simulation state. High-frequency vehicle positions stay in Redis, with sampled history written back to PostgreSQL. A deterministic simulator enters through the same HTTP, validation, queue, and domain paths as a real driver.

The product surfaces are:

- An operations health dashboard, searchable deliveries, a live fleet map, alerts, history, and analytics
- An explicit delivery state machine with immutable events and idempotent commands
- Capacity-safe manual dispatch, with PostgreSQL concurrency controls
- A driver workflow from assignment through proof of delivery
- Validated telemetry, freshness, server-sent event replay, ETA, risk, geofence, and route-deviation foundations
- Privacy-reduced public tracking links
- Seeded Normal shift, Peak period, Disruption, and Late shift simulations

The live fleet in the operations UI is a built-in East and Central London scene (isometric or top-down). Mapbox, when `MAPBOX_SECRET_TOKEN` is set, supplies server-side geocoding and directions behind a provider-neutral interface. Without that token, create and assign use the deterministic London fixture. The demo depot is Stratford. The demo drop-off is Covent Garden.

## Workspace

The repository is a pnpm workspace:

- `apps/web` — Next.js UI, auth, queries, commands, telemetry ingestion, and the customer tracking projection
- `apps/runtime` — Fastify server-sent event gateway, BullMQ telemetry worker, and simulation primitives
- `packages/domain` — dependency-free state machine and operational rules
- `packages/contracts` — shared Zod boundary schemas and API types
- `packages/database` — Prisma schema, client, and migrations
- `packages/providers` — provider-neutral geocoding and routing interfaces, plus adapters

```text
Next.js 16 / Vercel ── PostgreSQL (business truth)
        │
        ├── BullMQ ─── Redis (telemetry, queues, realtime replay)
        │                  │
        │                  ▼
        └──────────── Fly.io runtime (workers + SSE + simulation)
```

## Local processes

Docker Compose publishes PostgreSQL 17 on `localhost:5434` and Redis 7.4 on `localhost:6379`. Apply migrations with `pnpm db:migrate`. Use `pnpm db:migrate:dev` only when you intend to create a new Prisma migration.

| Script | Process | Role |
| --- | --- | --- |
| `pnpm dev` | Next.js, port 3000 | UI, auth, APIs, operations, driver, and tracking pages |
| `pnpm dev:runtime` | Fastify gateway, port 4000 | Live map stream and realtime updates |
| `pnpm dev:worker` | BullMQ worker | Telemetry, demo fleet ticker, simulation ticks, outbox to the stream, presence, and alerts |

`DEMO_FLEET_TICKER` accepts `true` or `false`. When the variable is unset, the worker posts demo telemetry outside production, every two seconds, for drivers who are not part of a running simulation. An official simulation run owns its agents while that run is running or paused.

If port 3000 is already taken, Next.js moves to the next free port. `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` have to match that port before sign-in will stick.

### Demo fixture

`pnpm db:seed` restores the demo organisation, accounts, and the Stratford to Covent Garden delivery. The default password is `ChangeMe123!` unless the `DEMO_*_PASSWORD` values in `.env` override it.

| Role | Email | Home |
| --- | --- | --- |
| Admin | `admin@deliveryos.local` | `/ops` |
| Dispatcher | `dispatcher@deliveryos.local` | `/ops` |
| Driver | `driver@deliveryos.local` | `/driver` |

The demo tracking page is `/track/deliveryos-demo-track-18421`.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` / `DIRECT_URL` | Pooled application URL and direct migration URL for PostgreSQL |
| `REDIS_URL` | Redis TCP connection for BullMQ, presence, streams, and rate limits |
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` | Authentication secret and canonical URL |
| `NEXT_PUBLIC_APP_URL` | Canonical browser application URL |
| `NEXT_PUBLIC_RUNTIME_URL` | Persistent server-sent event gateway URL |
| `WEB_ORIGIN` | Allowed origin for the runtime gateway |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Optional browser Mapbox token. Restrict it by URL if you set one. The operations map currently draws the built-in scene. |
| `MAPBOX_SECRET_TOKEN` | Server-only geocoding and directions token |
| `SIMULATION_CREDENTIAL_SECRET` | HMAC secret for simulator driver credentials. At least 32 characters. |
| `DEMO_FLEET_TICKER` | `true` or `false`. When unset, the worker demo ticker is on outside production. |
| `DEMO_*_EMAIL` / `DEMO_*_PASSWORD` | Local seed credentials |
| `SENTRY_DSN` / `NEXT_PUBLIC_POSTHOG_KEY` / `POSTHOG_KEY` | Optional scrubbed error reporting and product analytics. Empty values leave them off. |
| `SOAK_ADMIN_EMAIL` / `SOAK_ADMIN_PASSWORD` / `SOAK_ORGANIZATION_ID` | Credentials and organisation for the optional 100-driver soak |

## Quality gates

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Optional load acceptance, with the worker and the web app already running against the same PostgreSQL and Redis:

```bash
pnpm soak:100
```

Continuous integration runs check, typecheck, unit and integration tests, the production build, and Playwright on every push and pull request. It uses Node.js 24, pnpm 12.3.4, PostgreSQL 17, and Redis 7.4. Infrastructure-backed test conventions are in [TESTING.md](./TESTING.md).

## Security and privacy

Every tenant query requires a verified membership. Organisation, driver, role, and actor identity come from that session, never from a request body. Driver credentials and customer tracking tokens are hashed at rest. Unknown or cross-tenant resources are returned as not found.

The public tracking API returns its own projection. Responses use `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow`. The projection includes a delivery reference, status, progress text, an ETA window, and the driver's given name. An approximate location is included only while the delivery is en route to the drop-off or arrived there, and only when the latest position is within one kilometre of that stop. The coordinates are rounded to three decimal places and the observation time is bucketed to 30 seconds. Internal notes and the rest of the fleet stay off this response.

Event metadata stays small and schema-controlled. Logs omit precise coordinates, street addresses, tokens, passwords, and customer contact data.

## Deployment

The intended deployment puts Next.js on Vercel, PostgreSQL on Neon, queues on a BullMQ-compatible managed Redis, and two Fly.io process groups for the server-sent event gateway and the worker. Set secrets on each platform, apply Prisma migrations before the web deployment, then run one `gateway` process and one `worker` process. Redis is disposable operational infrastructure. PostgreSQL backups are the authority for delivery state.
