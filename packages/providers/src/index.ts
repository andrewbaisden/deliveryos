export type Coordinate = { latitude: number; longitude: number };
export type GeocodeQuery = {
  query: string;
  country?: string;
  proximity?: Coordinate;
};
export type PlaceCandidate = {
  providerId: string;
  label: string;
  coordinate: Coordinate;
};
export type StoredPlace = PlaceCandidate & {
  addressLine1: string;
  city: string;
  postalCode: string;
};
export type RouteRequest = {
  profile: "driving" | "driving-traffic" | "cycling";
  coordinates: Coordinate[];
};
export type CalculatedRoute = {
  provider: string;
  profile: string;
  geometry: { type: "LineString"; coordinates: [number, number][] };
  distanceM: number;
  durationSeconds: number;
};

export interface GeocodingProvider {
  search(input: GeocodeQuery): Promise<PlaceCandidate[]>;
  resolve(candidate: PlaceCandidate): Promise<StoredPlace>;
}
export interface RoutingProvider {
  calculate(input: RouteRequest): Promise<CalculatedRoute>;
}

export class ProviderUnavailableError extends Error {
  readonly code = "PROVIDER_UNAVAILABLE";
  constructor(provider: string, cause?: unknown) {
    super(`${provider} is temporarily unavailable`, { cause });
  }
}

export class MapboxProvider implements GeocodingProvider, RoutingProvider {
  constructor(
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async search(input: GeocodeQuery): Promise<PlaceCandidate[]> {
    const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
    url.searchParams.set("q", input.query);
    url.searchParams.set("access_token", this.token);
    url.searchParams.set("autocomplete", "true");
    if (input.country) url.searchParams.set("country", input.country);
    if (input.proximity)
      url.searchParams.set(
        "proximity",
        `${input.proximity.longitude},${input.proximity.latitude}`,
      );
    try {
      const response = await this.fetcher(url, {
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`Mapbox returned ${response.status}`);
      const payload = (await response.json()) as {
        features: Array<{
          id: string;
          properties?: { full_address?: string; name?: string };
          geometry: { coordinates: [number, number] };
        }>;
      };
      return payload.features.slice(0, 6).map((feature) => ({
        providerId: feature.id,
        label:
          feature.properties?.full_address ??
          feature.properties?.name ??
          "Unknown place",
        coordinate: {
          longitude: feature.geometry.coordinates[0],
          latitude: feature.geometry.coordinates[1],
        },
      }));
    } catch (error) {
      throw new ProviderUnavailableError("Mapbox geocoding", error);
    }
  }

  async resolve(candidate: PlaceCandidate): Promise<StoredPlace> {
    const url = new URL(`https://api.mapbox.com/search/geocode/v6/forward`);
    url.searchParams.set("q", candidate.label);
    url.searchParams.set("permanent", "true");
    url.searchParams.set("limit", "1");
    url.searchParams.set("access_token", this.token);
    try {
      const response = await this.fetcher(url, {
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`Mapbox returned ${response.status}`);
      const payload = (await response.json()) as {
        features: Array<{
          properties?: {
            name?: string;
            place_formatted?: string;
            context?: {
              place?: { name?: string };
              postcode?: { name?: string };
            };
          };
          geometry: { coordinates: [number, number] };
        }>;
      };
      const feature = payload.features[0];
      if (!feature) throw new Error("No permanent result");
      return {
        providerId: candidate.providerId,
        label: feature.properties?.place_formatted ?? candidate.label,
        addressLine1: feature.properties?.name ?? candidate.label,
        city: feature.properties?.context?.place?.name ?? "London",
        postalCode: feature.properties?.context?.postcode?.name ?? "",
        coordinate: {
          longitude: feature.geometry.coordinates[0],
          latitude: feature.geometry.coordinates[1],
        },
      };
    } catch (error) {
      throw new ProviderUnavailableError("Mapbox geocoding", error);
    }
  }

  async calculate(input: RouteRequest): Promise<CalculatedRoute> {
    if (input.coordinates.length < 2 || input.coordinates.length > 25)
      throw new Error("Routes require 2–25 coordinates");
    const points = input.coordinates
      .map((point) => `${point.longitude},${point.latitude}`)
      .join(";");
    const url = new URL(
      `https://api.mapbox.com/directions/v5/mapbox/${input.profile}/${points}`,
    );
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("overview", "full");
    url.searchParams.set("access_token", this.token);
    try {
      const response = await this.fetcher(url, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Mapbox returned ${response.status}`);
      const payload = (await response.json()) as {
        routes: Array<{
          geometry: { type: "LineString"; coordinates: [number, number][] };
          distance: number;
          duration: number;
        }>;
      };
      const route = payload.routes[0];
      if (!route) throw new Error("No route returned");
      return {
        provider: "mapbox",
        profile: input.profile,
        geometry: route.geometry,
        distanceM: Math.round(route.distance),
        durationSeconds: Math.round(route.duration),
      };
    } catch (error) {
      throw new ProviderUnavailableError("Mapbox routing", error);
    }
  }
}

const EAST_LONDON_DEPOT = { latitude: 51.5416, longitude: -0.0015 };
const CENTRAL_LONDON_DROPOFF = { latitude: 51.5118, longitude: -0.124 };

function fixtureCoordinate(seed: string): Coordinate {
  const normalized = seed.toLowerCase();
  if (/(stratford|e20|e15|east london|westfield)/.test(normalized)) {
    return EAST_LONDON_DEPOT;
  }
  if (/(covent|wc2|central london|soho|oxford circus)/.test(normalized)) {
    return CENTRAL_LONDON_DROPOFF;
  }
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1)
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return {
    latitude: 51.51 + (hash % 3_000) / 100_000,
    longitude: -0.13 + ((hash >>> 11) % 13_000) / 100_000,
  };
}

function extractPostcode(value: string) {
  return (
    value.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i)?.[0]?.toUpperCase() ??
    null
  );
}

export class FixtureGeocodingProvider implements GeocodingProvider {
  async search(input: GeocodeQuery): Promise<PlaceCandidate[]> {
    const coordinate = fixtureCoordinate(input.query.toLowerCase());
    return [
      {
        providerId: `fixture:${Buffer.from(input.query).toString("base64url").slice(0, 24)}`,
        label: input.query,
        coordinate,
      },
    ];
  }

  async resolve(candidate: PlaceCandidate): Promise<StoredPlace> {
    const postalCode =
      extractPostcode(candidate.label) ??
      extractPostcode(candidate.providerId) ??
      "E20 1EJ";
    return {
      providerId: candidate.providerId,
      label: candidate.label,
      addressLine1: candidate.label.split(",")[0]?.trim() || candidate.label,
      city: "London",
      postalCode,
      coordinate: candidate.coordinate,
    };
  }
}

export class FixtureRoutingProvider implements RoutingProvider {
  async calculate(input: RouteRequest): Promise<CalculatedRoute> {
    const coordinates = input.coordinates.map(
      ({ longitude, latitude }) => [longitude, latitude] as [number, number],
    );
    let distanceM = 0;
    for (let index = 1; index < input.coordinates.length; index += 1) {
      const from = input.coordinates[index - 1];
      const to = input.coordinates[index];
      if (!from || !to) continue;
      const dLat = ((to.latitude - from.latitude) * Math.PI) / 180;
      const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;
      const lat1 = (from.latitude * Math.PI) / 180;
      const lat2 = (to.latitude * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
      distanceM += 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    const metres = Math.max(50, Math.round(distanceM));
    return {
      provider: "fixture",
      profile: input.profile,
      geometry: { type: "LineString", coordinates },
      distanceM: metres,
      durationSeconds: Math.max(60, Math.round(metres / 8.5)),
    };
  }
}
