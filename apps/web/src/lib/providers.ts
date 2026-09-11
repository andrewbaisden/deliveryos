import {
  FixtureGeocodingProvider,
  FixtureRoutingProvider,
  type GeocodingProvider,
  MapboxProvider,
  type RoutingProvider,
} from "@deliveryos/providers";
import { serverEnv } from "./env";

export function createGeocodingProvider(): GeocodingProvider {
  if (serverEnv.MAPBOX_SECRET_TOKEN)
    return new MapboxProvider(serverEnv.MAPBOX_SECRET_TOKEN);
  return new FixtureGeocodingProvider();
}

export function createRoutingProvider(): RoutingProvider {
  if (serverEnv.MAPBOX_SECRET_TOKEN)
    return new MapboxProvider(serverEnv.MAPBOX_SECRET_TOKEN);
  return new FixtureRoutingProvider();
}
