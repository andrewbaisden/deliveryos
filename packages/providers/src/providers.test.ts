import { describe, expect, it } from "vitest";
import { FixtureGeocodingProvider, FixtureRoutingProvider } from ".";

describe("fixture providers", () => {
  it("returns provider-neutral geometry", async () => {
    const route = await new FixtureRoutingProvider().calculate({
      profile: "driving",
      coordinates: [
        { latitude: 51.5416, longitude: -0.0015 },
        { latitude: 51.5118, longitude: -0.124 },
      ],
    });
    expect(route.provider).toBe("fixture");
    expect(route.geometry.coordinates).toHaveLength(2);
    expect(route.distanceM).toBeGreaterThan(50);
  });

  it("resolves East and Central London fixture places deterministically", async () => {
    const geocoder = new FixtureGeocodingProvider();
    const [first] = await geocoder.search({
      query: "Stratford City, E20 1EJ",
    });
    const [again] = await geocoder.search({
      query: "Stratford City, E20 1EJ",
    });
    expect(first).toBeDefined();
    expect(first?.coordinate).toEqual(again?.coordinate);
    expect(first?.coordinate).toEqual({
      latitude: 51.5416,
      longitude: -0.0015,
    });
    if (!first) throw new Error("expected fixture candidate");
    const place = await geocoder.resolve(first);
    expect(place.city).toBe("London");
    expect(place.postalCode).toMatch(/E20/i);

    const [dropoff] = await geocoder.search({
      query: "Covent Garden, WC2E 8RF",
    });
    expect(dropoff?.coordinate).toEqual({
      latitude: 51.5118,
      longitude: -0.124,
    });
  });
});
