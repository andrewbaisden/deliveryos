# DeliveryOS

DeliveryOS is a production-oriented last-mile delivery operations platform. It separates authoritative delivery state from high-frequency vehicle telemetry and includes a deterministic simulator that enters the same HTTP, validation, queue, and domain pipelines as real drivers.

## Product surfaces

- Operations health dashboard, searchable deliveries, live fleet map, alerts, history, and analytics
- Explicit delivery state machine with immutable events and idempotent commands
- Capacity-safe manual dispatch with PostgreSQL concurrency controls
- Mobile driver workflow from assignment through proof of delivery
- Validated telemetry, freshness, SSE replay, ETA, risk, geofence, and deviation foundations
- Privacy-reduced public tracking links
- Seeded Normal Shift, Peak Period, Disruption, and Late Shift simulations

## Architecture

```text
Next.js 16 / Vercel ── PostgreSQL (business truth)
        │
        ├── BullMQ ─── Redis (telemetry, queues, realtime replay)
        │                  │
        │                  ▼
        └──────────── Fly.io runtime (workers + SSE + simulation)
```

The repository is a pnpm workspace:

- `apps/web` — Next.js UI, auth, queries, commands, telemetry ingestion, customer projection
- `apps/runtime` — Fastify SSE gateway, BullMQ telemetry worker, simulation primitives
- `packages/domain` — dependency-free state machine and operational rules
- `packages/contracts` — shared Zod boundary schemas and API types
- `packages/database` — Prisma schema/client and migrations
- `packages/providers` — provider-neutral geocoding/routing interfaces and adapters

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [DECISIONS.md](./DECISIONS.md) for details.

## Local setup

Requirements: Node 22+, pnpm 12+, and Docker.

### First-time setup

```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Leave Docker running. PostgreSQL is on `localhost:5434` and Redis on `localhost:6379`. Re-run `pnpm db:seed` whenever you want the demo organisation, accounts, and Stratford → Covent Garden fixture restored.

### Run the full app

You need **Docker plus three processes**. Start each command in its own terminal from the repo root:

| Script | What it runs | You need it for |
|---|---|---|
| `pnpm dev` | Next.js app on [http://localhost:3000](http://localhost:3000) | UI, auth, APIs, ops/driver/tracking pages |
| `pnpm dev:runtime` | Fastify SSE gateway on [http://localhost:4000](http://localhost:4000) | Live map stream and realtime updates |
| `pnpm dev:worker` | BullMQ worker | Telemetry, **demo fleet ticker**, simulation ticks, outbox → SSE, presence/alerts |

```bash
pnpm dev
```

```bash
pnpm dev:runtime
```

```bash
pnpm dev:worker
```

`pnpm dev` alone is enough to sign in and click around. For a live fleet map, keep `pnpm dev:runtime` and `pnpm dev:worker` running too. In development the worker posts demo telemetry every two seconds for drivers who are not on a running simulation, so vans move and show as LIVE without pressing Start on the Simulation page. Set `DEMO_FLEET_TICKER=false` to turn that off. An official Simulation run still owns its own agents while it is running or paused.

Open [http://localhost:3000](http://localhost:3000). If that port is busy, Next may start on `3001` — set `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` in `.env` to match and restart `pnpm dev`.

### Seeded accounts

Default password is `ChangeMe123!` unless you override the `DEMO_*_PASSWORD` values in `.env`.

| Role | Email | Home |
|---|---|---|
| Admin | `admin@deliveryos.local` | `/ops` |
| Dispatcher | `dispatcher@deliveryos.local` | `/ops` |
| Driver | `driver@deliveryos.local` | `/driver` |

The demo tracking page is `/track/deliveryos-demo-track-18421`. Use `pnpm db:migrate:dev` only when intentionally creating a new Prisma migration.

## Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Pooled application and direct migration PostgreSQL URLs |
| `REDIS_URL` | Redis TCP connection for BullMQ, presence, streams, and limits |
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` | Authentication secret and canonical URL |
| `NEXT_PUBLIC_APP_URL` | Canonical browser application URL |
| `NEXT_PUBLIC_RUNTIME_URL` | Persistent SSE gateway URL |
| `WEB_ORIGIN` | Allowed origin for the runtime SSE gateway |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Domain-restricted browser basemap token |
| `MAPBOX_SECRET_TOKEN` | Server-only permanent geocoding and directions token |
| `SIMULATION_CREDENTIAL_SECRET` | HMAC secret for simulator driver credentials |
| `DEMO_FLEET_TICKER` | `true`/`false`. When unset, the worker demo ticker is on outside production |
| `DEMO_*_EMAIL` / `DEMO_*_PASSWORD` | Local/portfolio seed credentials |
| `SENTRY_DSN` / `NEXT_PUBLIC_POSTHOG_KEY` | Optional scrubbed monitoring and product analytics |

Without a Mapbox browser token, the operations UI intentionally renders an accessible schematic fallback. Without `MAPBOX_SECRET_TOKEN`, create/assign use the deterministic East and Central London fixture geocoder and router. The demo depot is Stratford (East London) and the demo drop-off is Covent Garden (Central London).

## Quality gates

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Optional load acceptance with worker + web already running:

```bash
pnpm soak:100
```

CI runs check, typecheck, unit/integration tests, and production build on every push and pull request. Infrastructure-backed test conventions are described in [TESTING.md](./TESTING.md).

## Security and privacy

All tenant queries require a verified membership. Driver credentials and customer tracking tokens are hashed at rest. The public tracking API returns a purpose-built projection, uses no-store/noindex headers, and never returns internal notes or the full fleet. Exact location should only be added to that projection after the planned one-kilometre proximity and precision-reduction rule has been evaluated.

## Deployment

The intended portfolio deployment uses Vercel for Next.js, Neon for PostgreSQL, a BullMQ-compatible managed Redis service, and two Fly.io process groups for the SSE gateway and worker. Set secrets in each platform, apply Prisma migrations before the web deployment, then scale one `gateway` and one `worker` process. Redis is disposable operational infrastructure; PostgreSQL backups are authoritative.
