export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  runtimeUrl: process.env.NEXT_PUBLIC_RUNTIME_URL ?? "http://localhost:4000",
  mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "",
};
