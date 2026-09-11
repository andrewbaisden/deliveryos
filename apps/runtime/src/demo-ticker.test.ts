import { describe, expect, it } from "vitest";
import {
  DEMO_CYCLE_MS,
  DEMO_DEPOT,
  DEMO_DROPOFF,
  demoTickerEnabled,
  demoTickerPoint,
  shouldTickDriver,
  triangleProgress,
} from "./demo-ticker";

describe("demo ticker", () => {
  const pickup = DEMO_DEPOT;
  const dropoff = DEMO_DROPOFF;
  const driverId = "20000000-0000-4000-8000-000000000007";

  it("is on in development unless explicitly disabled", () => {
    expect(demoTickerEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(
      demoTickerEnabled({
        NODE_ENV: "development",
        DEMO_FLEET_TICKER: "false",
      }),
    ).toBe(false);
    expect(demoTickerEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(
      demoTickerEnabled({ NODE_ENV: "production", DEMO_FLEET_TICKER: "true" }),
    ).toBe(true);
  });

  it("skips offline drivers and active simulation agents", () => {
    expect(
      shouldTickDriver({ status: "AVAILABLE", simulationRunStatus: null }),
    ).toBe(true);
    expect(
      shouldTickDriver({ status: "OFFLINE", simulationRunStatus: null }),
    ).toBe(false);
    expect(
      shouldTickDriver({
        status: "ON_DELIVERY",
        simulationRunStatus: "RUNNING",
      }),
    ).toBe(false);
    expect(
      shouldTickDriver({
        status: "ASSIGNED",
        simulationRunStatus: "COMPLETED",
      }),
    ).toBe(true);
  });

  it("folds a cycle into a triangle wave", () => {
    expect(triangleProgress(0)).toBe(0);
    expect(triangleProgress(0.25)).toBe(0.5);
    expect(triangleProgress(0.5)).toBe(1);
    expect(triangleProgress(0.75)).toBe(0.5);
    expect(triangleProgress(1)).toBe(0);
  });

  it("moves an assigned van along the corridor over time", () => {
    const first = demoTickerPoint({
      nowMs: 0,
      driverId,
      deliveryStatus: "EN_ROUTE_TO_DROPOFF",
      pickup,
      dropoff,
    });
    const later = demoTickerPoint({
      nowMs: DEMO_CYCLE_MS / 4,
      driverId,
      deliveryStatus: "EN_ROUTE_TO_DROPOFF",
      pickup,
      dropoff,
    });
    expect(first.latitude).not.toBeCloseTo(later.latitude, 5);
    expect(later.longitude).toBeLessThan(pickup.longitude);
    expect(later.longitude).toBeGreaterThan(dropoff.longitude);
  });

  it("keeps idle vans near the depot and apart from each other", () => {
    const alex = demoTickerPoint({
      nowMs: 10_000,
      driverId,
      deliveryStatus: null,
      pickup,
      dropoff,
    });
    const maya = demoTickerPoint({
      nowMs: 10_000,
      driverId: "20000000-0000-4000-8000-000000000012",
      deliveryStatus: "AVAILABLE",
      pickup,
      dropoff,
    });
    expect(alex.latitude).toBeGreaterThan(51.53);
    expect(alex.latitude).toBeLessThan(51.55);
    expect(alex.longitude).not.toBeCloseTo(maya.longitude, 5);
  });
});
