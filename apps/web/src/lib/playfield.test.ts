import { describe, expect, it } from "vitest";
import {
  markerInitials,
  PLAYFIELD_LANDMARKS,
  PLAYFIELD_ZONES,
  polygonToSvgPoints,
  projectToPlayfield,
  zoneBoundaryGeoJson,
  zoneLabelAnchor,
} from "./playfield";

describe("playfield projection", () => {
  it("places the East London depot on the right and toward the north", () => {
    const point = projectToPlayfield(PLAYFIELD_LANDMARKS.depot, "flat");
    expect(point.x).toBeGreaterThan(70);
    expect(point.y).toBeLessThan(45);
  });

  it("places Covent Garden on the left and toward the river", () => {
    const point = projectToPlayfield(PLAYFIELD_LANDMARKS.dropoff, "flat");
    expect(point.x).toBeLessThan(30);
    expect(point.y).toBeGreaterThan(55);
  });

  it("keeps the same east-west relationship on the isometric plate", () => {
    const depot = projectToPlayfield(PLAYFIELD_LANDMARKS.depot, "isometric");
    const dropoff = projectToPlayfield(
      PLAYFIELD_LANDMARKS.dropoff,
      "isometric",
    );
    expect(depot.x).toBeGreaterThan(dropoff.x);
    expect(depot.y).toBeLessThan(dropoff.y);
  });

  it("clamps coordinates outside the playfield", () => {
    const west = projectToPlayfield(
      { latitude: 51.53, longitude: -0.4 },
      "flat",
    );
    const east = projectToPlayfield(
      { latitude: 51.53, longitude: 0.2 },
      "flat",
    );
    expect(west.x).toBeGreaterThanOrEqual(3);
    expect(east.x).toBeLessThanOrEqual(97);
  });

  it("builds two-letter initials", () => {
    expect(markerInitials("Alex Morgan")).toBe("AM");
  });

  it("projects DSP zones into closed SVG polygons", () => {
    expect(PLAYFIELD_ZONES).toHaveLength(2);
    const east = polygonToSvgPoints(PLAYFIELD_ZONES[0].polygon, "flat");
    expect(east.split(" ")).toHaveLength(4);
    const boundary = zoneBoundaryGeoJson(PLAYFIELD_ZONES[0]);
    expect(boundary.type).toBe("Polygon");
    expect(boundary.coordinates[0]).toHaveLength(5);
  });

  it("anchors zone labels inside the projected polygon", () => {
    const east = zoneLabelAnchor(PLAYFIELD_ZONES[0], "flat");
    const central = zoneLabelAnchor(PLAYFIELD_ZONES[1], "flat");
    expect(east.x).toBeGreaterThan(central.x);
    expect(east.y).toBeGreaterThan(0);
    expect(east.y).toBeLessThan(100);
  });
});
