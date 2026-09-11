"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PlayfieldScene } from "@/components/playfield-scene";
import {
  PLAYFIELDS,
  type PlayfieldStyle,
  readStoredPlayfieldStyle,
  storePlayfieldStyle,
} from "@/lib/playfield";

type DriverPoint = {
  id: string;
  name: string;
  presence: string;
  latitude: number;
  longitude: number;
  headingDegrees: number | null;
  observedAt: string;
  routeCode: string | null;
};

export function FleetMap({ organizationId }: { organizationId: string }) {
  const pointsRef = useRef<Record<string, DriverPoint>>({});
  const frameRef = useRef<number | null>(null);
  const cursorRef = useRef("0");
  const [points, setPoints] = useState<DriverPoint[]>([]);
  const [style, setStyle] = useState<PlayfieldStyle>("isometric");

  const flushPoints = useCallback(() => {
    frameRef.current = null;
    setPoints(Object.values(pointsRef.current));
  }, []);

  const scheduleFlush = useCallback(() => {
    if (frameRef.current === null)
      frameRef.current = requestAnimationFrame(flushPoints);
  }, [flushPoints]);

  useEffect(() => {
    setStyle(readStoredPlayfieldStyle());
  }, []);

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
            routeCode?: string | null;
            location: DriverPoint;
          }) => [
            driver.id,
            {
              id: driver.id,
              name: driver.name,
              presence: driver.presence,
              latitude: driver.location.latitude,
              longitude: driver.location.longitude,
              headingDegrees: driver.location.headingDegrees ?? null,
              observedAt: driver.location.observedAt,
              routeCode: driver.routeCode ?? null,
            },
          ],
        ),
    );
    scheduleFlush();
  }, [organizationId, scheduleFlush]);

  useEffect(() => {
    void loadSnapshot();
    const snapshotTimer = setInterval(() => void loadSnapshot(), 4_000);
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
            headingDegrees?: number | null;
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
          headingDegrees: envelope.payload.headingDegrees ?? null,
          observedAt: envelope.payload.observedAt,
          routeCode: existing?.routeCode ?? null,
        };
        scheduleFlush();
      };
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
      clearInterval(snapshotTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [loadSnapshot, organizationId, scheduleFlush]);

  function chooseStyle(next: PlayfieldStyle) {
    setStyle(next);
    storePlayfieldStyle(next);
  }

  return (
    <div className="map-wrap">
      <PlayfieldScene style={style} actors={points} />
      <div className="map-overlay">
        <span className="map-pill">Drivers · {points.length}</span>
        <span className="map-pill">Zones · E / C</span>
        <span className="map-pill">Live stream</span>
      </div>
      <fieldset className="map-style-toggle">
        <legend className="sr-only">Map style</legend>
        {(Object.keys(PLAYFIELDS) as PlayfieldStyle[]).map((value) => (
          <button
            type="button"
            className={value === style ? "active" : ""}
            aria-pressed={value === style}
            onClick={() => chooseStyle(value)}
            key={value}
          >
            {PLAYFIELDS[value].label}
          </button>
        ))}
      </fieldset>
      <section
        className="map-list"
        aria-label="Live driver location alternative"
      >
        {points.length === 0
          ? "No current telemetry"
          : points
              .map(
                (point) =>
                  `${point.routeCode ? `${point.routeCode} ` : ""}${point.name}: ${point.presence}`,
              )
              .join(" · ")}
      </section>
    </div>
  );
}
