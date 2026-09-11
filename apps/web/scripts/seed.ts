import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { config as loadEnv } from "dotenv";
import { PLAYFIELD_ZONES, zoneBoundaryGeoJson } from "../src/lib/playfield.ts";

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

const zoneByName = new Map<string, string>();
for (const zone of PLAYFIELD_ZONES) {
  const boundary = zoneBoundaryGeoJson(zone);
  const row = await database.zone.upsert({
    where: { organizationId_name: { organizationId, name: zone.name } },
    update: { boundary },
    create: { organizationId, name: zone.name, boundary },
  });
  zoneByName.set(zone.name, row.id);
}
const eastId = zoneByName.get("East London");
const centralId = zoneByName.get("Central London");
if (!eastId || !centralId) throw new Error("Seed zones could not be resolved");

const drivers = [
  {
    id: "20000000-0000-4000-8000-000000000007",
    name: "Alex Morgan",
    status: "ON_DELIVERY" as const,
    zoneId: eastId,
    userId: driverUser.id,
  },
  {
    id: "20000000-0000-4000-8000-000000000012",
    name: "Maya Patel",
    status: "AVAILABLE" as const,
    zoneId: eastId,
  },
  {
    id: "20000000-0000-4000-8000-000000000004",
    name: "Noah Williams",
    status: "ON_DELIVERY" as const,
    zoneId: eastId,
  },
  {
    id: "20000000-0000-4000-8000-000000000018",
    name: "Freya Chen",
    status: "ASSIGNED" as const,
    zoneId: centralId,
  },
  {
    id: "20000000-0000-4000-8000-000000000022",
    name: "Leo Campbell",
    status: "ON_BREAK" as const,
    zoneId: eastId,
  },
] as const;

const permanentDriverIds = drivers.map((driver) => driver.id);

// Clear leftover simulation fleets without cascading over live assignments.
await database.deliveryAssignment.deleteMany({
  where: {
    organizationId,
    OR: [
      { driver: { simulationRunId: { not: null } } },
      { delivery: { simulationRunId: { not: null } } },
    ],
  },
});
await database.delivery.updateMany({
  where: { organizationId, simulationRunId: { not: null } },
  data: { assignedDriverId: null, simulationRunId: null },
});
await database.driver.updateMany({
  where: { organizationId, id: { in: [...permanentDriverIds] } },
  data: { simulationRunId: null },
});
await database.simulationRun.deleteMany({ where: { organizationId } });

for (const driver of drivers) {
  await database.driver.upsert({
    where: { id: driver.id },
    update: {
      status: driver.status,
      zoneId: driver.zoneId,
      simulationRunId: null,
      ...("userId" in driver ? { userId: driver.userId } : {}),
    },
    create: {
      id: driver.id,
      organizationId,
      zoneId: driver.zoneId,
      name: driver.name,
      status: driver.status,
      ...("userId" in driver ? { userId: driver.userId } : {}),
    },
  });
}

type SeedJob = {
  id: string;
  reference: string;
  routeCode: string;
  driverId: string;
  zoneId: string;
  status: "ASSIGNED" | "EN_ROUTE_TO_PICKUP" | "EN_ROUTE_TO_DROPOFF";
  customerName: string;
  pickup: {
    addressLine1: string;
    postalCode: string;
    latitude: number;
    longitude: number;
  };
  dropoff: {
    addressLine1: string;
    postalCode: string;
    latitude: number;
    longitude: number;
  };
  waypoint?: {
    addressLine1: string;
    postalCode: string;
    latitude: number;
    longitude: number;
  };
};

const jobs: SeedJob[] = [
  {
    id: "40000000-0000-4000-8000-000000018421",
    reference: "DOS-18421",
    routeCode: "A23",
    driverId: drivers[0].id,
    zoneId: centralId,
    status: "EN_ROUTE_TO_DROPOFF",
    customerName: "Owen & Co.",
    pickup: {
      addressLine1: "Stratford City",
      postalCode: "E20 1EJ",
      latitude: 51.5416,
      longitude: -0.0015,
    },
    waypoint: {
      addressLine1: "Mile End Road hub",
      postalCode: "E3 4PH",
      latitude: 51.5254,
      longitude: -0.0332,
    },
    dropoff: {
      addressLine1: "Covent Garden",
      postalCode: "WC2E 8RF",
      latitude: 51.5118,
      longitude: -0.124,
    },
  },
  {
    id: "40000000-0000-4000-8000-000000018422",
    reference: "DOS-18422",
    routeCode: "B24",
    driverId: drivers[2].id,
    zoneId: centralId,
    status: "EN_ROUTE_TO_PICKUP",
    customerName: "Soho Kitchen",
    pickup: {
      addressLine1: "Homerton High Street",
      postalCode: "E9 6AS",
      latitude: 51.5482,
      longitude: -0.0435,
    },
    waypoint: {
      addressLine1: "Old Street roundabout",
      postalCode: "EC1V 9NR",
      latitude: 51.5256,
      longitude: -0.0875,
    },
    dropoff: {
      addressLine1: "Soho Square",
      postalCode: "W1D 3QP",
      latitude: 51.5152,
      longitude: -0.132,
    },
  },
  {
    id: "40000000-0000-4000-8000-000000018423",
    reference: "DOS-18423",
    routeCode: "C18",
    driverId: drivers[3].id,
    zoneId: eastId,
    status: "ASSIGNED",
    customerName: "Bloomsbury Books",
    pickup: {
      addressLine1: "Queen Elizabeth Olympic Park",
      postalCode: "E20 2ST",
      latitude: 51.5388,
      longitude: -0.0125,
    },
    waypoint: {
      addressLine1: "Bethnal Green Road",
      postalCode: "E2 0AA",
      latitude: 51.5271,
      longitude: -0.0558,
    },
    dropoff: {
      addressLine1: "Russell Square",
      postalCode: "WC1B 5EH",
      latitude: 51.5218,
      longitude: -0.1247,
    },
  },
];

const seedJobIds = jobs.map((job) => job.id);
await database.delivery.updateMany({
  where: {
    organizationId,
    id: { notIn: seedJobIds },
    status: {
      in: [
        "UNASSIGNED",
        "ASSIGNED",
        "ACCEPTED",
        "EN_ROUTE_TO_PICKUP",
        "ARRIVED_PICKUP",
        "PICKED_UP",
        "EN_ROUTE_TO_DROPOFF",
        "ARRIVED_DROPOFF",
      ],
    },
  },
  data: {
    status: "CANCELLED",
    assignedDriverId: null,
    simulationRunId: null,
  },
});

for (const job of jobs) {
  await database.customer.upsert({
    where: {
      id: `30000000-0000-4000-8000-00000000000${job.reference.slice(-1)}`,
    },
    update: { name: job.customerName },
    create: {
      id: `30000000-0000-4000-8000-00000000000${job.reference.slice(-1)}`,
      organizationId,
      name: job.customerName,
      email: `${job.routeCode.toLowerCase()}@example.test`,
    },
  });
}

for (const job of jobs) {
  const customerId = `30000000-0000-4000-8000-00000000000${job.reference.slice(-1)}`;
  const now = Date.now();
  const pickupDone = job.status === "EN_ROUTE_TO_DROPOFF";
  await database.deliveryStop.deleteMany({ where: { deliveryId: job.id } });
  await database.deliveryAssignment.deleteMany({
    where: { deliveryId: job.id },
  });
  await database.delivery.upsert({
    where: {
      organizationId_reference: {
        organizationId,
        reference: job.reference,
      },
    },
    update: {
      assignedDriverId: job.driverId,
      zoneId: job.zoneId,
      customerId,
      status: job.status,
      externalReference: job.routeCode,
      risk: "ON_TIME",
      version: 1,
      simulationRunId: null,
      actualPickupAt: pickupDone ? new Date(now - 15 * 60_000) : null,
      actualDeliveryAt: null,
      recipientName: null,
      proofNote: null,
      plannedPickupAt: new Date(now - 40 * 60_000),
      promisedDeliveryAt: new Date(now + 40 * 60_000),
      originalEtaAt: new Date(now + 25 * 60_000),
      currentEtaAt: new Date(now + 18 * 60_000),
    },
    create: {
      id: job.id,
      organizationId,
      customerId,
      zoneId: job.zoneId,
      assignedDriverId: job.driverId,
      reference: job.reference,
      externalReference: job.routeCode,
      status: job.status,
      risk: "ON_TIME",
      plannedPickupAt: new Date(now - 40 * 60_000),
      promisedDeliveryAt: new Date(now + 40 * 60_000),
      originalEtaAt: new Date(now + 25 * 60_000),
      currentEtaAt: new Date(now + 18 * 60_000),
      actualPickupAt: pickupDone ? new Date(now - 15 * 60_000) : null,
    },
  });

  const stops = [
    {
      organizationId,
      deliveryId: job.id,
      sequence: 0,
      kind: "PICKUP" as const,
      addressLine1: job.pickup.addressLine1,
      city: "London",
      postalCode: job.pickup.postalCode,
      latitude: job.pickup.latitude,
      longitude: job.pickup.longitude,
      arrivedAt: pickupDone ? new Date(now - 20 * 60_000) : null,
      completedAt: pickupDone ? new Date(now - 15 * 60_000) : null,
    },
    ...(job.waypoint
      ? [
          {
            organizationId,
            deliveryId: job.id,
            sequence: 1,
            kind: "DROPOFF" as const,
            addressLine1: job.waypoint.addressLine1,
            city: "London",
            postalCode: job.waypoint.postalCode,
            latitude: job.waypoint.latitude,
            longitude: job.waypoint.longitude,
            arrivedAt: null,
            completedAt: null,
          },
        ]
      : []),
    {
      organizationId,
      deliveryId: job.id,
      sequence: job.waypoint ? 2 : 1,
      kind: "DROPOFF" as const,
      addressLine1: job.dropoff.addressLine1,
      city: "London",
      postalCode: job.dropoff.postalCode,
      latitude: job.dropoff.latitude,
      longitude: job.dropoff.longitude,
      arrivedAt: null,
      completedAt: null,
    },
  ];
  // Keep ticker/domain happy: first stop pickup, last stop final dropoff.
  // Intermediate is also DROPOFF for demo multi-point sketch.
  for (const stop of stops) {
    await database.deliveryStop.create({ data: stop });
  }

  await database.deliveryAssignment.create({
    data: {
      organizationId,
      deliveryId: job.id,
      driverId: job.driverId,
      assignedById: user.id,
    },
  });
}

const primary = jobs[0];
if (
  (await database.domainEvent.count({ where: { deliveryId: primary.id } })) ===
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
        aggregateId: primary.id,
        deliveryId: primary.id,
        driverId: primary.driverId,
        eventType,
        occurredAt: new Date(Date.now() - (40 - index * 4) * 60_000),
        actorType: index < 2 ? "USER" : "DRIVER",
        actorId: index < 2 ? user.id : primary.driverId,
        metadata: { routeCode: primary.routeCode },
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
    deliveryId: primary.id,
    tokenHash: createHash("sha256").update(trackingToken).digest("hex"),
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
  },
});

console.info("DeliveryOS demo seeded", {
  accounts: { adminEmail, dispatcherEmail, driverEmail },
  organizationId,
  routes: jobs.map((job) => ({
    routeCode: job.routeCode,
    reference: job.reference,
    driverId: job.driverId,
    status: job.status,
  })),
  zones: PLAYFIELD_ZONES.map((zone) => zone.name),
  trackingPath: `/track/${trackingToken}`,
});
await database.$disconnect();
