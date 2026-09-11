import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(import.meta.dirname, "../../../.env") });
loadEnv();

const { database } = await import("@deliveryos/database/client");
if (!database) throw new Error("DATABASE_URL is required to seed DeliveryOS");

const organizationId = "11111111-1111-4111-8111-111111111111";
const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? "admin@deliveryos.local";
const adminPassword = process.env.DEMO_ADMIN_PASSWORD ?? "ChangeMe123!";
const dispatcherEmail =
  process.env.DEMO_DISPATCHER_EMAIL ?? "dispatcher@deliveryos.local";
const dispatcherPassword =
  process.env.DEMO_DISPATCHER_PASSWORD ?? "ChangeMe123!";
const driverEmail = process.env.DEMO_DRIVER_EMAIL ?? "driver@deliveryos.local";
const driverPassword = process.env.DEMO_DRIVER_PASSWORD ?? "ChangeMe123!";
const seedAuth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  database: prismaAdapter(database, { provider: "postgresql" }),
  secret:
    process.env.BETTER_AUTH_SECRET ?? "development-only-secret-change-me-now",
  emailAndPassword: { enabled: true },
  advanced: { database: { generateId: false } },
});

async function ensureUser(email: string, password: string, name: string) {
  const existing = await database.user.findUnique({ where: { email } });
  if (existing) return existing;
  await seedAuth.api.signUpEmail({ body: { email, password, name } });
  return database.user.findUniqueOrThrow({ where: { email } });
}

const user = await ensureUser(adminEmail, adminPassword, "Jordan Ellis");
const dispatcher = await ensureUser(
  dispatcherEmail,
  dispatcherPassword,
  "Sam Rivera",
);
const driverUser = await ensureUser(driverEmail, driverPassword, "Alex Morgan");

await database.organization.upsert({
  where: { id: organizationId },
  update: {
    name: "East London Delivery Co.",
    slug: "east-london-delivery-co",
  },
  create: {
    id: organizationId,
    name: "East London Delivery Co.",
    slug: "east-london-delivery-co",
    timeZone: "Europe/London",
  },
});
await database.membership.upsert({
  where: { organizationId_userId: { organizationId, userId: user.id } },
  update: { role: "ADMIN" },
  create: { organizationId, userId: user.id, role: "ADMIN" },
});
await database.membership.upsert({
  where: {
    organizationId_userId: { organizationId, userId: dispatcher.id },
  },
  update: { role: "DISPATCHER" },
  create: { organizationId, userId: dispatcher.id, role: "DISPATCHER" },
});
await database.membership.upsert({
  where: {
    organizationId_userId: { organizationId, userId: driverUser.id },
  },
  update: { role: "DRIVER" },
  create: { organizationId, userId: driverUser.id, role: "DRIVER" },
});

const zoneNames = ["East London", "Central London"];
for (const name of zoneNames) {
  await database.zone.upsert({
    where: { organizationId_name: { organizationId, name } },
    update: {},
    create: { organizationId, name },
  });
}
const east = await database.zone.findUniqueOrThrow({
  where: { organizationId_name: { organizationId, name: "East London" } },
});
const central = await database.zone.findUniqueOrThrow({
  where: { organizationId_name: { organizationId, name: "Central London" } },
});

const drivers = [
  ["20000000-0000-4000-8000-000000000007", "Alex Morgan", "ON_DELIVERY"],
  ["20000000-0000-4000-8000-000000000012", "Maya Patel", "AVAILABLE"],
  ["20000000-0000-4000-8000-000000000004", "Noah Williams", "ON_DELIVERY"],
  ["20000000-0000-4000-8000-000000000018", "Freya Chen", "ASSIGNED"],
  ["20000000-0000-4000-8000-000000000022", "Leo Campbell", "ON_BREAK"],
] as const;
for (const [id, name, status] of drivers) {
  await database.driver.upsert({
    where: { id },
    update: {
      status,
      zoneId: east.id,
      ...(id === drivers[0][0] ? { userId: driverUser.id } : {}),
    },
    create: {
      id,
      organizationId,
      zoneId: east.id,
      name,
      status,
      ...(id === drivers[0][0] ? { userId: driverUser.id } : {}),
    },
  });
}

const customer = await database.customer.upsert({
  where: { id: "30000000-0000-4000-8000-000000000001" },
  update: {},
  create: {
    id: "30000000-0000-4000-8000-000000000001",
    organizationId,
    name: "Owen & Co.",
    email: "dispatch@example.test",
  },
});
const delivery = await database.delivery.upsert({
  where: {
    organizationId_reference: { organizationId, reference: "DOS-18421" },
  },
  update: {
    assignedDriverId: drivers[0][0],
    zoneId: central.id,
    status: "EN_ROUTE_TO_DROPOFF",
    risk: "ON_TIME",
    version: 1,
    actualDeliveryAt: null,
    recipientName: null,
    proofNote: null,
  },
  create: {
    id: "40000000-0000-4000-8000-000000018421",
    organizationId,
    customerId: customer.id,
    zoneId: central.id,
    assignedDriverId: drivers[0][0],
    reference: "DOS-18421",
    status: "EN_ROUTE_TO_DROPOFF",
    risk: "ON_TIME",
    plannedPickupAt: new Date(Date.now() - 40 * 60_000),
    promisedDeliveryAt: new Date(Date.now() + 40 * 60_000),
    originalEtaAt: new Date(Date.now() + 25 * 60_000),
    currentEtaAt: new Date(Date.now() + 11 * 60_000),
    actualPickupAt: new Date(Date.now() - 15 * 60_000),
    stops: {
      create: [
        {
          organizationId,
          sequence: 0,
          kind: "PICKUP",
          addressLine1: "Stratford City",
          city: "London",
          postalCode: "E20 1EJ",
          latitude: 51.5416,
          longitude: -0.0015,
          arrivedAt: new Date(Date.now() - 20 * 60_000),
          completedAt: new Date(Date.now() - 15 * 60_000),
        },
        {
          organizationId,
          sequence: 1,
          kind: "DROPOFF",
          addressLine1: "Covent Garden",
          city: "London",
          postalCode: "WC2E 8RF",
          latitude: 51.5118,
          longitude: -0.124,
        },
      ],
    },
  },
});
const activeAssignment = await database.deliveryAssignment.findFirst({
  where: { organizationId, deliveryId: delivery.id, endedAt: null },
});
if (!activeAssignment) {
  await database.deliveryAssignment.create({
    data: {
      organizationId,
      deliveryId: delivery.id,
      driverId: drivers[0][0],
      assignedById: user.id,
    },
  });
}
if (
  (await database.domainEvent.count({ where: { deliveryId: delivery.id } })) ===
  0
) {
  const events = [
    "delivery.created",
    "delivery.assigned",
    "driver.accepted",
    "pickup.route_started",
    "pickup.arrived",
    "pickup.completed",
    "delivery.departed",
  ];
  for (const [index, eventType] of events.entries()) {
    await database.domainEvent.create({
      data: {
        organizationId,
        aggregateType: "DELIVERY",
        aggregateId: delivery.id,
        deliveryId: delivery.id,
        driverId: drivers[0][0],
        eventType,
        occurredAt: new Date(Date.now() - (40 - index * 4) * 60_000),
        actorType: index < 2 ? "USER" : "DRIVER",
        actorId: index < 2 ? user.id : drivers[0][0],
        metadata: {},
      },
    });
  }
}
const trackingToken = "deliveryos-demo-track-18421";
await database.trackingToken.upsert({
  where: {
    tokenHash: createHash("sha256").update(trackingToken).digest("hex"),
  },
  update: { expiresAt: new Date(Date.now() + 7 * 86_400_000), revokedAt: null },
  create: {
    organizationId,
    deliveryId: delivery.id,
    tokenHash: createHash("sha256").update(trackingToken).digest("hex"),
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
  },
});

console.info("DeliveryOS demo seeded", {
  accounts: { adminEmail, dispatcherEmail, driverEmail },
  organizationId,
  trackingPath: `/track/${trackingToken}`,
});
await database.$disconnect();
