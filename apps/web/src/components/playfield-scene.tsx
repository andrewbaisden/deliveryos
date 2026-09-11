"use client";

import Image from "next/image";
import {
  PLAYFIELD_LANDMARKS,
  PLAYFIELD_ZONES,
  PLAYFIELDS,
  type PlayfieldStyle,
  polygonToSvgPoints,
  projectToPlayfield,
  zoneLabelAnchor,
} from "@/lib/playfield";

export type PlayfieldActor = {
  id: string;
  name: string;
  presence: string;
  latitude: number;
  longitude: number;
  headingDegrees: number | null;
  routeCode?: string | null;
};

export function PlayfieldScene({
  style,
  actors,
  showLandmarks = true,
  showZones = true,
  label = "Live fleet playfield",
}: {
  style: PlayfieldStyle;
  actors: PlayfieldActor[];
  showLandmarks?: boolean;
  showZones?: boolean;
  label?: string;
}) {
  const art = PLAYFIELDS[style];
  return (
    <div className="playfield" role="img" aria-label={label}>
      <Image
        className="playfield-art"
        src={art.src}
        alt=""
        fill
        sizes="(max-width: 1100px) 100vw, 960px"
        priority
      />
      {showZones && (
        <svg
          className="playfield-zones"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {PLAYFIELD_ZONES.map((zone) => (
            <polygon
              key={zone.id}
              points={polygonToSvgPoints(zone.polygon, style)}
              fill={zone.color}
              stroke={zone.stroke}
              strokeWidth="0.35"
              strokeLinejoin="round"
            />
          ))}
        </svg>
      )}
      {showZones &&
        PLAYFIELD_ZONES.map((zone) => {
          const anchor = zoneLabelAnchor(zone, style);
          return (
            <div
              className="playfield-zone-label"
              style={{ left: `${anchor.x}%`, top: `${anchor.y}%` }}
              key={`${zone.id}-label`}
            >
              <strong>{zone.code}</strong>
              <span>{zone.name}</span>
            </div>
          );
        })}
      {showLandmarks &&
        Object.values(PLAYFIELD_LANDMARKS).map((landmark) => {
          const point = projectToPlayfield(landmark, style);
          return (
            <div
              className={`map-marker landmark landmark-${landmark.id}`}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              title={landmark.name}
              key={landmark.id}
            >
              <span>{landmark.id === "depot" ? "DP" : "CG"}</span>
            </div>
          );
        })}
      {actors.map((actor) => {
        const point = projectToPlayfield(actor, style);
        const heading = (actor.headingDegrees ?? 90) - 90;
        return (
          <div
            className="map-actor"
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            title={`${actor.routeCode ? `${actor.routeCode} · ` : ""}${actor.name} · ${actor.presence}`}
            key={actor.id}
          >
            <div
              className={`map-van ${actor.presence === "STALE" || actor.presence === "OFFLINE" ? "stale" : ""}`}
              style={{
                transform: `translate(-50%, -50%) rotate(${heading}deg)`,
              }}
            >
              <span className="map-van-cargo" />
              <span className="map-van-cab" />
              <span className="sr-only">{actor.name}</span>
            </div>
            {actor.routeCode ? (
              <span className="map-route-code">{actor.routeCode}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
