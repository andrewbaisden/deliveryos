"use client";

import {
  type GeoJSONSource,
  type Map as MapInstance,
  setWorkerUrl,
} from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { publicEnv } from "@/lib/public-env";

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

type DriverPoint = {
  id: string;
  name: string;
  presence: string;
  latitude: number;
  longitude: number;
  observedAt: string;
};

export function FleetMap({ organizationId }: { organizationId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const pointsRef = useRef<Record<string, DriverPoint>>({});
  const frameRef = useRef<number | null>(null);
  const cursorRef = useRef("0");
  const [points, setPoints] = useState<DriverPoint[]>([]);
  const [mapReady, setMapReady] = useState(false);

  const flushPoints = useCallback(() => {
    frameRef.current = null;
    const next = Object.values(pointsRef.current);
    setPoints(next);
    const source = mapRef.current?.getSource("drivers") as
      | GeoJSONSource
      | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: next.map((point) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [point.longitude, point.latitude],
        },
        properties: {
          id: point.id,
          name: point.name,
          presence: point.presence,
        },
      })),
    });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (frameRef.current === null)
      frameRef.current = requestAnimationFrame(flushPoints);
  }, [flushPoints]);

  const loadSnapshot = useCallback(async () => {
    const response = await fetch(
      `/api/v1/organizations/${organizationId}/operations/snapshot`,
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const body = await response.json();
    pointsRef.current = Object.fromEntries(
      body.data.drivers
        .filter((driver: { location: DriverPoint | null }) => driver.location)
        .map(
          (driver: {
            id: string;
            name: string;
            presence: string;
            location: DriverPoint;
          }) => [
            driver.id,
            {
              id: driver.id,
              name: driver.name,
              presence: driver.presence,
              latitude: driver.location.latitude,
              longitude: driver.location.longitude,
              observedAt: driver.location.observedAt,
            },
          ],
        ),
    );
    scheduleFlush();
  }, [organizationId, scheduleFlush]);

  useEffect(() => {
    void loadSnapshot();
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;
    async function connect() {
      const response = await fetch(
        `/api/v1/organizations/${organizationId}/realtime-ticket`,
        { method: "POST" },
      );
      if (!response.ok || disposed) return;
      const body = await response.json();
      const url = new URL(body.data.streamUrl);
      url.searchParams.set("ticket", body.data.token);
      url.searchParams.set("cursor", cursorRef.current);
      source = new EventSource(url);
      source.onopen = () => {
        attempt = 0;
      };
      const applyUpdate = (message: MessageEvent<string>) => {
        const envelope = JSON.parse(message.data) as {
          cursor?: string;
          type?: string;
          entity?: { id: string };
          payload?: {
            latitude: number;
            longitude: number;
            observedAt: string;
          };
        };
        cursorRef.current =
          envelope.cursor ?? message.lastEventId ?? cursorRef.current;
        if (
          envelope.type !== "driver.location_updated" ||
          !envelope.entity ||
          !envelope.payload
        )
          return;
        const existing = pointsRef.current[envelope.entity.id];
        pointsRef.current[envelope.entity.id] = {
          id: envelope.entity.id,
          name: existing?.name ?? `Driver ${envelope.entity.id.slice(-4)}`,
          presence: "LIVE",
          latitude: envelope.payload.latitude,
          longitude: envelope.payload.longitude,
          observedAt: envelope.payload.observedAt,
        };
        scheduleFlush();
      };
      // Gateway emits named `update` events; `onmessage` only receives unnamed ones.
      source.addEventListener("update", applyUpdate);
      source.onmessage = applyUpdate;
      source.addEventListener("stream.reset", () => {
        cursorRef.current = "0";
        void loadSnapshot();
      });
      source.onerror = () => {
        source?.close();
        if (disposed) return;
        const delay =
          Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 300;
        attempt += 1;
        reconnectTimer = setTimeout(() => void connect(), delay);
      };
    }
    void connect();
    return () => {
      disposed = true;
      source?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [loadSnapshot, organizationId, scheduleFlush]);

  useEffect(() => {
    if (!containerRef.current || !publicEnv.mapboxToken) return;
    let disposed = false;
    void import("maplibre-gl").then((maplibre) => {
      if (disposed || !containerRef.current) return;
      const map = new maplibre.Map({
        container: containerRef.current,
        center: [-0.063, 51.527],
        zoom: 11.2,
        style: {
          version: 8,
          sources: {
            mapbox: {
              type: "raster",
              tiles: [
                `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/512/{z}/{x}/{y}@2x?access_token=${publicEnv.mapboxToken}`,
              ],
              tileSize: 512,
              attribution: "© Mapbox © OpenStreetMap",
            },
          },
          layers: [{ id: "basemap", type: "raster", source: "mapbox" }],
        },
      });
      mapRef.current = map;
      map.addControl(
        new maplibre.NavigationControl({ showCompass: false }),
        "bottom-left",
      );
      map.on("load", () => {
        map.addSource("drivers", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "drivers",
          type: "circle",
          source: "drivers",
          paint: {
            "circle-radius": 8,
            "circle-color": [
              "case",
              ["==", ["get", "presence"], "LIVE"],
              "#1f9d68",
              "#d08b2e",
            ],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });
        setMapReady(true);
        scheduleFlush();
      });
    });
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [scheduleFlush]);

  return (
    <div className="map-wrap">
      <div className="map" ref={containerRef} />
      {!mapReady && (
        <div className="map-placeholder">
          <div className="river" />
          <div className="route-line" />
          {points.map((point) => (
            <div
              className={`map-marker ${point.presence === "STALE" ? "stale" : ""}`}
              style={{
                left: `${Math.max(4, Math.min(94, 50 + (point.longitude + 0.063) * 400))}%`,
                top: `${Math.max(4, Math.min(90, 50 - (point.latitude - 51.527) * 400))}%`,
              }}
              key={point.id}
            >
              <span>
                {point.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="map-overlay">
        <span className="map-pill">Drivers · {points.length}</span>
        <span className="map-pill">Live stream</span>
      </div>
      <section
        className="map-list"
        aria-label="Live driver location alternative"
      >
        {points.length === 0
          ? "No current telemetry"
          : points
              .map((point) => `${point.name}: ${point.presence}`)
              .join(" · ")}
      </section>
    </div>
  );
}
