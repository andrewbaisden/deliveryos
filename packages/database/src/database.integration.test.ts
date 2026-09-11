import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "./client";

const integration = process.env.DATABASE_URL ? describe : describe.skip;
const organizationA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const organizationB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const database = process.env.DATABASE_URL ? createDatabase() : null;

integration("PostgreSQL domain protections", () => {
  beforeAll(async () => {
    if (!database) return;
    await database.organization.deleteMany({
      where: { id: { in: [organizationA, organizationB] } },
    });
    await database.organization.createMany({
      data: [
        { id: organizationA, name: "Tenant A", slug: `tenant-a-${Date.now()}` },
        { id: organizationB, name: "Tenant B", slug: `tenant-b-${Date.now()}` },
      ],
    });
  });

  afterAll(async () => {
    if (!database) return;
    await database.organization.deleteMany({
      where: { id: { in: [organizationA, organizationB] } },
    });
    await database.$disconnect();
  });

  it("rejects cross-tenant delivery assignments", async () => {
    if (!database) return;
    const [customer, foreignDriver] = await Promise.all([
      database.customer.create({
        data: { organizationId: organizationA, name: "A customer" },
      }),
      database.driver.create({
        data: {
          organizationId: organizationB,
          name: "B driver",
          status: "AVAILABLE",
        },
      }),
    ]);
    await expect(
      database.delivery.create({
        data: {
          organizationId: organizationA,
          customerId: customer.id,
          assignedDriverId: foreignDriver.id,
          reference: "CROSS-TENANT",
          plannedPickupAt: new Date(),
          promisedDeliveryAt: new Date(Date.now() + 60_000),
        },
      }),
    ).rejects.toThrow();
  });

  it("rolls back projection, event, and outbox atomically", async () => {
    if (!database) return;
    const eventType = `test.rollback.${Date.now()}`;
    await expect(
      database.$transaction(async (transaction) => {
        const event = await transaction.domainEvent.create({
          data: {
            organizationId: organizationA,
            aggregateType: "ALERT",
            aggregateId: crypto.randomUUID(),
            eventType,
            actorType: "SYSTEM",
          },
        });
        await transaction.outboxEvent.create({
          data: { organizationId: organizationA, domainEventId: event.id },
        });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await database.domainEvent.count({ where: { eventType } })).toBe(0);
  });

  it("enforces one active assignment and tracking token", async () => {
    if (!database) return;
    const [customer, firstDriver, secondDriver] = await Promise.all([
      database.customer.create({
        data: { organizationId: organizationA, name: "Assignment customer" },
      }),
      database.driver.create({
        data: {
          organizationId: organizationA,
          name: "Driver one",
          status: "AVAILABLE",
        },
      }),
      database.driver.create({
        data: {
          organizationId: organizationA,
          name: "Driver two",
          status: "AVAILABLE",
        },
      }),
    ]);
    const delivery = await database.delivery.create({
      data: {
        organizationId: organizationA,
        customerId: customer.id,
        assignedDriverId: firstDriver.id,
        reference: `ASSIGN-${Date.now()}`,
        status: "ASSIGNED",
        plannedPickupAt: new Date(),
        promisedDeliveryAt: new Date(Date.now() + 60_000),
      },
    });
    await database.deliveryAssignment.create({
      data: {
        organizationId: organizationA,
        deliveryId: delivery.id,
        driverId: firstDriver.id,
      },
    });
    await expect(
      database.deliveryAssignment.create({
        data: {
          organizationId: organizationA,
          deliveryId: delivery.id,
          driverId: secondDriver.id,
        },
      }),
    ).rejects.toThrow();
    await database.trackingToken.create({
      data: {
        organizationId: organizationA,
        deliveryId: delivery.id,
        tokenHash: createHashValue(`token-one-${delivery.id}`),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await expect(
      database.trackingToken.create({
        data: {
          organizationId: organizationA,
          deliveryId: delivery.id,
          tokenHash: createHashValue(`token-two-${delivery.id}`),
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
    ).rejects.toThrow();
  });

  it("enforces coordinates and one running simulation per tenant", async () => {
    if (!database) return;
    const customer = await database.customer.create({
      data: { organizationId: organizationA, name: "Coordinate customer" },
    });
    const delivery = await database.delivery.create({
      data: {
        organizationId: organizationA,
        customerId: customer.id,
        reference: `COORD-${Date.now()}`,
        plannedPickupAt: new Date(),
        promisedDeliveryAt: new Date(Date.now() + 60_000),
      },
    });
    await expect(
      database.deliveryStop.create({
        data: {
          organizationId: organizationA,
          deliveryId: delivery.id,
          sequence: 0,
          kind: "PICKUP",
          addressLine1: "Invalid point",
          city: "London",
          postalCode: "W1",
          latitude: 91,
          longitude: 0,
        },
      }),
    ).rejects.toThrow();
    await database.simulationRun.create({
      data: {
        organizationId: organizationA,
        scenario: "NORMAL_SHIFT",
        seed: 1,
        driverCount: 5,
        speed: 1,
        status: "RUNNING",
      },
    });
    await expect(
      database.simulationRun.create({
        data: {
          organizationId: organizationA,
          scenario: "PEAK_PERIOD",
          seed: 2,
          driverCount: 5,
          speed: 2,
          status: "RUNNING",
        },
      }),
    ).rejects.toThrow();
  });

  it("prevents concurrent active assignments to the same delivery", async () => {
    if (!database) return;
    const customer = await database.customer.create({
      data: { organizationId: organizationA, name: "Concurrency customer" },
    });
    const drivers = await Promise.all(
      ["Concurrent one", "Concurrent two"].map((name) =>
        database.driver.create({
          data: { organizationId: organizationA, name, status: "AVAILABLE" },
        }),
      ),
    );
    const delivery = await database.delivery.create({
      data: {
        organizationId: organizationA,
        customerId: customer.id,
        reference: `CONCURRENT-${Date.now()}`,
        plannedPickupAt: new Date(),
        promisedDeliveryAt: new Date(Date.now() + 60_000),
      },
    });
    const results = await Promise.allSettled(
      drivers.map((driver) =>
        database.deliveryAssignment.create({
          data: {
            organizationId: organizationA,
            deliveryId: delivery.id,
            driverId: driver.id,
          },
        }),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });
});

function createHashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
