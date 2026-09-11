export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export type PlayfieldStyle = "isometric" | "flat";

export type PlayfieldPercent = {
  x: number;
  y: number;
};

type PlayfieldInset = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/**
 * GPS box covering the seeded Stratford depot, Covent Garden drop-off,
 * and the simulation grid around that corridor.
 */
export const PLAYFIELD_BOUNDS = {
  west: -0.145,
  east: 0.02,
  south: 51.504,
  north: 51.56,
} as const;

export const PLAYFIELD_LANDMARKS = {
  depot: {
    id: "depot",
    name: "Stratford depot",
    latitude: 51.5416,
    longitude: -0.0015,
  },
  dropoff: {
    id: "dropoff",
    name: "Covent Garden",
    latitude: 51.5118,
    longitude: -0.124,
  },
} as const;

/**
 * Schematic DSP-style service areas for Option 1.
 * Coordinates are WGS84 rings; the UI projects them onto the painted map.
 */
export const PLAYFIELD_ZONES = [
  {
    id: "east-london",
    name: "East London",
    code: "E",
    routePrefix: "A",
    color: "rgba(30, 104, 75, 0.18)",
    stroke: "rgba(30, 104, 75, 0.55)",
    polygon: [
      { latitude: 51.56, longitude: -0.06 },
      { latitude: 51.56, longitude: 0.02 },
      { latitude: 51.504, longitude: 0.02 },
      { latitude: 51.504, longitude: -0.06 },
    ],
  },
  {
    id: "central-london",
    name: "Central London",
    code: "C",
    routePrefix: "B",
    color: "rgba(29, 79, 115, 0.16)",
    stroke: "rgba(29, 79, 115, 0.5)",
    polygon: [
      { latitude: 51.56, longitude: -0.145 },
      { latitude: 51.56, longitude: -0.06 },
      { latitude: 51.504, longitude: -0.06 },
      { latitude: 51.504, longitude: -0.145 },
    ],
  },
] as const;

export type PlayfieldZone = (typeof PLAYFIELD_ZONES)[number];

export function zoneBoundaryGeoJson(zone: PlayfieldZone) {
  const ring = [
    ...zone.polygon.map(
      (point) => [point.longitude, point.latitude] as [number, number],
    ),
    [zone.polygon[0].longitude, zone.polygon[0].latitude] as [number, number],
  ];
  return {
    type: "Polygon" as const,
    coordinates: [ring],
  };
}

export const PLAYFIELDS: Record<
  PlayfieldStyle,
  {
    src: string;
    label: string;
    inset: PlayfieldInset;
    northCompress: number;
  }
> = {
  isometric: {
    src: "/maps/fleet-playfield.png",
    label: "Isometric",
    inset: { left: 0.04, right: 0.06, top: 0.12, bottom: 0.24 },
    northCompress: 0.1,
  },
  flat: {
    src: "/maps/fleet-playfield-flat.png",
    label: "Top-down",
    inset: { left: 0.03, right: 0.04, top: 0.06, bottom: 0.27 },
    northCompress: 0,
  },
};

const STYLE_STORAGE_KEY = "deliveryos.playfield-style";

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function isPlayfieldStyle(value: string): value is PlayfieldStyle {
  return value === "isometric" || value === "flat";
}

export function readStoredPlayfieldStyle(): PlayfieldStyle {
  if (typeof window === "undefined") return "isometric";
  const stored = window.localStorage.getItem(STYLE_STORAGE_KEY);
  return stored && isPlayfieldStyle(stored) ? stored : "isometric";
}

export function storePlayfieldStyle(style: PlayfieldStyle) {
  window.localStorage.setItem(STYLE_STORAGE_KEY, style);
}

export function projectToPlayfield(
  point: GeoPoint,
  style: PlayfieldStyle,
): PlayfieldPercent {
  const { west, east, south, north } = PLAYFIELD_BOUNDS;
  const { inset, northCompress } = PLAYFIELDS[style];
  const nx = clamp01((point.longitude - west) / (east - west));
  const ny = clamp01((north - point.latitude) / (north - south));
  const xAdjusted = 0.5 + (nx - 0.5) * (1 - northCompress * (1 - ny));
  const width = 1 - inset.left - inset.right;
  const height = 1 - inset.top - inset.bottom;
  return {
    x: (inset.left + xAdjusted * width) * 100,
    y: (inset.top + ny * height) * 100,
  };
}

export function projectPolygonToPlayfield(
  polygon: readonly GeoPoint[],
  style: PlayfieldStyle,
): PlayfieldPercent[] {
  return polygon.map((point) => projectToPlayfield(point, style));
}

export function polygonToSvgPoints(
  polygon: readonly GeoPoint[],
  style: PlayfieldStyle,
): string {
  return projectPolygonToPlayfield(polygon, style)
    .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
}

export function zoneLabelAnchor(
  zone: PlayfieldZone,
  style: PlayfieldStyle,
): PlayfieldPercent {
  const projected = projectPolygonToPlayfield(zone.polygon, style);
  const x =
    projected.reduce((sum, point) => sum + point.x, 0) / projected.length;
  const y =
    projected.reduce((sum, point) => sum + point.y, 0) / projected.length;
  return { x, y };
}

export function markerInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
