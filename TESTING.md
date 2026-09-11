# Testing DeliveryOS

## Test layers

- Domain Vitest suites are infrastructure-free and cover state transitions, terminal states, risk/freshness boundaries, ETA, geofence confirmation, deviation filtering, and seeded randomness.
- Contract suites validate Zod telemetry boundaries and stale/future observations.
- Provider suites use fixture adapters and mocked fetch. Live Mapbox smoke tests are optional and never run on untrusted pull requests.
- Runtime suites cover deterministic agent creation, logical time, and SSE cursor ordering. Redis integration tests run against Docker/CI Redis.
- PostgreSQL integration tests use the local Docker database and exercise constraints, tenant isolation, event/outbox atomicity, idempotency, and concurrency.
- React Testing Library covers status presentation and related UI contracts under `apps/web` with a jsdom environment.
- Playwright covers dispatcher create/detail, driver proof-of-delivery, customer tracking, and axe accessibility checks.

## Commands

```bash
pnpm test
pnpm test:e2e
pnpm soak:100
pnpm --filter @deliveryos/domain test
pnpm --filter @deliveryos/runtime test
pnpm typecheck
pnpm check
pnpm build
```

Tests requiring PostgreSQL and Redis assume `docker compose up -d`. Test databases must never share a production URL. Seeded simulation fixtures specify scenario version, seed, driver count, and speed.

`pnpm soak:100` requires the web API and runtime worker to be running against the same Redis/Postgres instance.

## Mandatory cases

- Every valid and invalid delivery transition, duplicate command, failure/return rule, and proof requirement
- Same delivery assigned concurrently, one driver capacity exceeded concurrently, repeated completion, serialization retry
- Telemetry coordinate/value/time validation, identity mismatch, duplicate event ID, out-of-order observation
- SSE ticket/cursor helpers, expired cursor reset semantics, and reconnect behaviour in the fleet map client
- Geofence threshold/hysteresis and deviation accuracy/duration/clearance
- Same simulator seed produces the same paths, lifecycle order, and exceptions
- Customer DTO excludes internal notes, exact pre-approach position, other jobs, and full driver identity

Critical domain and concurrency failures block deployment.
