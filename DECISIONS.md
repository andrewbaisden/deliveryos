# Architecture Decision Record

## ADR-001 — Explicit delivery state machine
Accepted. A pure transition function owns lifecycle legality; service code owns transactional persistence and side effects.

## ADR-002 — Separate operational and telemetry state
Accepted. Delivery state is low-frequency PostgreSQL truth. Latest location, presence, and replay buffers are transient Redis data, with sampled PostgreSQL history.

## ADR-003 — PostgreSQL authority and transactional outbox
Accepted. Business changes and their event records commit together. The outbox publishes at least once, and consumers deduplicate UUIDs.

## ADR-004 — Redis responsibilities
Accepted. Redis holds queues, latest locations, rate limits, short-lived tickets, dedupe keys, caches, and bounded organisation streams. Its loss cannot rewrite delivery history.

## ADR-005 — Simulation through production paths
Accepted. Simulation emits authenticated HTTP telemetry and commands rather than invoking marker or database shortcuts.

## ADR-006 — SSE over WebSockets
Accepted. Dashboard traffic is server-to-client, while commands already use HTTPS. SSE cursors and reconnects fit that direction and reduce protocol surface.

## ADR-007 — MapLibre renderer with Mapbox services
Accepted. MapLibre prevents renderer lock-in. Mapbox supplies basemap, permanent geocoding, and directions behind provider-neutral interfaces. Provider terms and usage must be reviewed before launch.

## ADR-008 — Sampled telemetry retention
Accepted. Keep bounded high-resolution Redis streams, 30-second/movement-gated snapshots, seven-day downsampling, and 90-day sampled history.

## ADR-009 — Customer location privacy
Accepted. Public tracking receives a distinct DTO, hides location before pickup, reveals only an approximate position within one kilometre, and never exposes fleet context.

## ADR-010 — Split Vercel and persistent runtime
Accepted. Next.js serves web/API work. Fly.io owns connections, workers, outbox polling, and simulation to avoid serverless-duration coupling.

## ADR-011 — Application-owned tenancy
Accepted. Better Auth authenticates; custom `Organization` and `Membership` models authorise all operational access.

## ADR-012 — Idempotency and assignment concurrency
Accepted. PostgreSQL idempotency records, request hashes, versions, row locks, partial unique indexes, and serializable retries protect commands.

## ADR-013 — No Order or PostGIS in MVP
Accepted. `Delivery.externalReference` is the order integration seam. Decimal coordinates and provider-neutral route geometry are adequate until database spatial queries justify PostGIS.
