import { describe, expect, it } from "vitest";
import {
  calculateProgressEta,
  classifyFreshness,
  classifyRisk,
  createPrng,
  deliveryStatuses,
  evaluateDeviation,
  evaluateGeofence,
  headingDegrees,
  InvalidDeliveryTransitionError,
  inferDriverRouteLocation,
  interpolateCoordinate,
  transitionDelivery,
} from ".";

const base = {
  status: "UNASSIGNED" as const,
  version: 1,
  assignedDriverId: null,
  actualPickupAt: null,
  actualDeliveryAt: null,
};
const now = new Date("2026-09-10T12:00:00.000Z");

describe("delivery state machine", () => {
  it.each([
    ["UNASSIGNED", "ASSIGN", "ASSIGNED", "delivery.assigned"],
    ["ASSIGNED", "UNASSIGN", "UNASSIGNED", "delivery.unassigned"],
    ["ASSIGNED", "ACCEPT", "ACCEPTED", "driver.accepted"],
    [
      "ACCEPTED",
      "START_PICKUP_ROUTE",
      "EN_ROUTE_TO_PICKUP",
      "pickup.route_started",
    ],
    ["EN_ROUTE_TO_PICKUP", "ARRIVE_PICKUP", "ARRIVED_PICKUP", "pickup.arrived"],
    ["ARRIVED_PICKUP", "CONFIRM_PICKUP", "PICKED_UP", "pickup.completed"],
    ["PICKED_UP", "DEPART_PICKUP", "EN_ROUTE_TO_DROPOFF", "delivery.departed"],
    [
      "EN_ROUTE_TO_DROPOFF",
      "ARRIVE_DROPOFF",
      "ARRIVED_DROPOFF",
      "dropoff.arrived",
    ],
    ["ARRIVED_DROPOFF", "COMPLETE", "DELIVERED", "delivery.completed"],
  ] as const)(
    "transitions %s with %s to %s",
    (status, command, next, eventType) => {
      const result = transitionDelivery(
        {
          ...base,
          status,
          assignedDriverId: status === "UNASSIGNED" ? null : "driver-1",
        },
        command,
        {
          now,
          ...(command === "ASSIGN" ? { assignedDriverId: "driver-1" } : {}),
          ...(command === "COMPLETE" ? { recipientName: "Sam" } : {}),
        },
      );
      expect(result.delivery.status).toBe(next);
      expect(result.eventType).toBe(eventType);
    },
  );

  it("supports the complete happy path", () => {
    let state = transitionDelivery(base, "ASSIGN", {
      now,
      assignedDriverId: "driver-1",
    }).delivery;
    for (const command of [
      "ACCEPT",
      "START_PICKUP_ROUTE",
      "ARRIVE_PICKUP",
      "CONFIRM_PICKUP",
      "DEPART_PICKUP",
      "ARRIVE_DROPOFF",
    ] as const) {
      state = transitionDelivery(state, command, { now }).delivery;
    }
    state = transitionDelivery(state, "COMPLETE", {
      now,
      recipientName: "Sam",
    }).delivery;
    expect(state.status).toBe("DELIVERED");
    expect(state.actualPickupAt).toEqual(now);
    expect(state.actualDeliveryAt).toEqual(now);
    expect(state.version).toBe(9);
  });

  it.each(deliveryStatuses.filter((status) => status !== "ARRIVED_DROPOFF"))(
    "rejects completion from %s",
    (status) => {
      expect(() =>
        transitionDelivery({ ...base, status }, "COMPLETE", {
          now,
          recipientName: "Sam",
        }),
      ).toThrow(InvalidDeliveryTransitionError);
    },
  );

  it("requires proof recipient on completion", () => {
    expect(() =>
      transitionDelivery({ ...base, status: "ARRIVED_DROPOFF" }, "COMPLETE", {
        now,
      }),
    ).toThrow("recipientName");
  });

  it("requires return after a post-pickup failure", () => {
    const result = transitionDelivery(
      { ...base, status: "PICKED_UP" },
      "FAIL",
      { now },
    );
    expect(result.delivery.status).toBe("RETURN_REQUIRED");
  });

  it.each(["DELIVERED", "FAILED", "CANCELLED", "RETURN_REQUIRED"] as const)(
    "rejects every command from terminal state %s",
    (status) => {
      for (const command of [
        "ASSIGN",
        "UNASSIGN",
        "ACCEPT",
        "START_PICKUP_ROUTE",
        "ARRIVE_PICKUP",
        "CONFIRM_PICKUP",
        "DEPART_PICKUP",
        "ARRIVE_DROPOFF",
        "COMPLETE",
        "CANCEL",
        "FAIL",
      ] as const) {
        expect(() =>
          transitionDelivery({ ...base, status }, command, {
            now,
            assignedDriverId: "driver-1",
            recipientName: "Sam",
          }),
        ).toThrow(InvalidDeliveryTransitionError);
      }
    },
  );

  it("only permits unassignment before acceptance", () => {
    expect(
      transitionDelivery({ ...base, status: "ASSIGNED" }, "UNASSIGN", { now })
        .delivery.status,
    ).toBe("UNASSIGNED");
    expect(() =>
      transitionDelivery({ ...base, status: "ACCEPTED" }, "UNASSIGN", { now }),
    ).toThrow(InvalidDeliveryTransitionError);
  });
});

describe("operational classifiers", () => {
  it("classifies risk at exact boundaries", () => {
    const promised = new Date("2026-09-10T13:00:00Z");
    expect(classifyRisk(new Date("2026-09-10T12:49:59Z"), promised)).toBe(
      "ON_TIME",
    );
    expect(classifyRisk(new Date("2026-09-10T12:50:00Z"), promised)).toBe(
      "AT_RISK",
    );
    expect(classifyRisk(new Date("2026-09-10T13:00:01Z"), promised)).toBe(
      "DELAYED",
    );
  });

  it("classifies freshness", () => {
    expect(classifyFreshness(new Date(now.getTime() - 15_000), now)).toBe(
      "LIVE",
    );
    expect(classifyFreshness(new Date(now.getTime() - 61_000), now)).toBe(
      "STALE",
    );
    expect(classifyFreshness(new Date(now.getTime() - 181_000), now)).toBe(
      "OFFLINE",
    );
    expect(classifyFreshness(new Date(now.getTime() - 16_000), now)).toBe(
      "RECENT",
    );
    expect(classifyFreshness(new Date(now.getTime() - 60_000), now)).toBe(
      "RECENT",
    );
    expect(classifyFreshness(new Date(now.getTime() - 180_000), now)).toBe(
      "STALE",
    );
  });

  it("replays seeded randomness", () => {
    const first = createPrng(812_764);
    const second = createPrng(812_764);
    expect(Array.from({ length: 10 }, first)).toEqual(
      Array.from({ length: 10 }, second),
    );
  });

  it("calculates an ETA from remaining route progress", () => {
    expect(
      calculateProgressEta({
        now,
        routeDurationSeconds: 1_200,
        routeDistanceM: 10_000,
        remainingDistanceM: 2_500,
      }).getTime(),
    ).toBe(now.getTime() + 300_000);
  });

  it("confirms a geofence only after two spaced samples", () => {
    const initial = {
      insideSamples: 0,
      outsideSamples: 0,
      entered: false,
      firstInsideAt: null,
    };
    const first = evaluateGeofence(initial, 50, now);
    expect(first.event).toBeNull();
    const second = evaluateGeofence(
      first.state,
      45,
      new Date(now.getTime() + 5_000),
    );
    expect(second.event).toBe("ENTERED");
    const hysteresis = evaluateGeofence(
      second.state,
      90,
      new Date(now.getTime() + 10_000),
    );
    expect(hysteresis.event).toBeNull();
    const outsideOne = evaluateGeofence(
      hysteresis.state,
      101,
      new Date(now.getTime() + 15_000),
    );
    const outsideTwo = evaluateGeofence(
      outsideOne.state,
      110,
      new Date(now.getTime() + 20_000),
    );
    expect(outsideTwo.event).toBe("EXITED");
  });

  it("filters inaccurate points and confirms sustained deviation", () => {
    const initial = {
      outsideSamples: 0,
      insideSamples: 0,
      firstOutsideAt: null,
      deviating: false,
    };
    expect(evaluateDeviation(initial, 200, 120, now).event).toBeNull();
    const one = evaluateDeviation(initial, 200, 10, now);
    const two = evaluateDeviation(
      one.state,
      210,
      10,
      new Date(now.getTime() + 15_000),
    );
    const detected = evaluateDeviation(
      two.state,
      220,
      10,
      new Date(now.getTime() + 30_000),
    );
    expect(detected.event).toBe("DETECTED");
    const clearOne = evaluateDeviation(
      detected.state,
      90,
      10,
      new Date(now.getTime() + 35_000),
    );
    const clearTwo = evaluateDeviation(
      clearOne.state,
      80,
      10,
      new Date(now.getTime() + 40_000),
    );
    const clearThree = evaluateDeviation(
      clearTwo.state,
      70,
      10,
      new Date(now.getTime() + 45_000),
    );
    expect(clearThree.event).toBe("CLEARED");
  });

  it("uses actual completion when classifying completed delivery risk", () => {
    const promised = new Date("2026-09-10T13:00:00Z");
    expect(
      classifyRisk(
        new Date("2026-09-10T14:00:00Z"),
        promised,
        new Date("2026-09-10T12:59:00Z"),
      ),
    ).toBe("AT_RISK");
  });

  it("interpolates coordinates and computes compass headings", () => {
    const pickup = { latitude: 51.5416, longitude: -0.0015 };
    const dropoff = { latitude: 51.5118, longitude: -0.124 };
    const mid = interpolateCoordinate(pickup, dropoff, 0.5);
    expect(mid.latitude).toBeCloseTo(51.5267, 4);
    expect(mid.longitude).toBeCloseTo(-0.06275, 4);
    expect(headingDegrees(pickup, dropoff)).toBeGreaterThan(220);
    expect(headingDegrees(pickup, dropoff)).toBeLessThan(280);
    const outbound = inferDriverRouteLocation({
      status: "ASSIGNED",
      pickup,
      dropoff,
    });
    expect(outbound.latitude).toBe(pickup.latitude);
    const inbound = inferDriverRouteLocation({
      status: "EN_ROUTE_TO_DROPOFF",
      pickup,
      dropoff,
    });
    expect(inbound.longitude).toBeLessThan(pickup.longitude);
    expect(inbound.longitude).toBeGreaterThan(dropoff.longitude);
    const home = inferDriverRouteLocation({
      status: "DELIVERED",
      pickup,
      dropoff,
    });
    expect(home.latitude).toBe(pickup.latitude);
  });
});
