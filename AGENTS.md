# DeliveryOS Engineering Rules

## Boundaries

- Keep TypeScript strict. Do not add `any`, unsafe assertions, or unchecked external data.
- Domain rules live in `packages/domain`; React and route handlers never assign delivery status directly.
- Zod validates every HTTP, environment, provider, queue, and public-tracking boundary.
- PostgreSQL is authoritative for delivery state, assignments, events, tokens, and simulation state. Never make Redis the sole source of truth for these.
- All tenant-owned reads and writes require an organisation-scoped authorised context. Never bypass organisation scoping.
- Domain packages do not import React, Next.js, Prisma, Redis, BullMQ, or provider response types.

## State and events

- Never change delivery transition behaviour without table-driven unit tests.
- A successful lifecycle mutation updates state, assignment/driver projection, immutable domain event, outbox row, and idempotent response in one transaction.
- Invalid transitions return `INVALID_TRANSITION`; do not coerce them into a happy path.
- Event metadata must be small, schema-controlled, and free of secrets, addresses, or coordinate trails.

## Data and concurrency

- Every schema change needs a reviewed Prisma migration. Preserve raw SQL constraints and partial indexes.
- Assignment/capacity changes use serializable transactions, deterministic row-lock ordering, and concurrency tests.
- Mutating APIs require an idempotency key. Reusing a key with a different request hash is a conflict.
- Do not retain every GPS point. Respect sampling and retention policy.

## Realtime and simulation

- SSE payloads are versioned and deduplicated. Reconnect must use a cursor or perform a full snapshot reset.
- Frequent location updates go to the map store, not TanStack Query or broad React state.
- Simulation must use the same telemetry endpoint and domain command services as real drivers wherever practical. Never implement it as browser-only marker animation.
- Preserve seeded reproducibility; never use global `Math.random()` in simulator decisions.

## Security and privacy

- Never trust organisation, driver, role, or actor identity from a request body.
- Hash driver and tracking credentials, use tenant-safe 404s, and keep customer DTOs separate from internal DTOs.
- Do not log precise coordinates, addresses, tokens, passwords, or customer contact data.
- Mapbox secret tokens are server-only; public tokens must be URL-restricted.

## Delivery workflow

- Use pnpm only and justify new production dependencies.
- Run Biome, typecheck, relevant tests, and build before handoff.
- Use Conventional Commits and keep migrations, implementation, tests, and documentation logically grouped.
