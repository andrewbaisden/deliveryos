"use client";

import { Check, Truck } from "lucide-react";
import { useEffect, useState } from "react";

type Projection = {
  reference: string;
  status: string;
  progressText: string;
  etaWindow: { from: string; to: string } | null;
  driver: { displayName: string } | null;
  approximateLocation: {
    latitude: number;
    longitude: number;
    observedAt: string;
  } | null;
};

export function TrackingView({ token }: { token: string }) {
  const [projection, setProjection] = useState<Projection | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    async function refresh() {
      const response = await fetch(
        `/api/v1/tracking/${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );
      const body = await response.json();
      if (!active) return;
      if (response.ok) {
        setProjection(body.data);
        setError(null);
      } else
        setError(body.error?.message ?? "Tracking is temporarily unavailable.");
    }
    void refresh();
    const interval = setInterval(() => void refresh(), 15_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [token]);

  const formatTime = (value: string) =>
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  return (
    <main className="tracking-page">
      <div className="tracking-shell">
        <div className="tracking-brand">
          <span className="brand-mark">
            <Truck size={17} />
          </span>
          DeliveryOS
        </div>
        <article className="tracking-card">
          <div className="tracking-top" aria-live="polite">
            {error ? (
              <>
                <p className="eyebrow">Tracking</p>
                <h1>Link unavailable</h1>
                <p className="subtitle">{error}</p>
              </>
            ) : !projection ? (
              <>
                <p className="eyebrow">Your delivery</p>
                <h1>Loading live progress…</h1>
              </>
            ) : (
              <>
                <p className="eyebrow">Delivery #{projection.reference}</p>
                <h1>{projection.progressText}</h1>
                <p className="subtitle">
                  {projection.driver
                    ? `${projection.driver.displayName} is handling your delivery.`
                    : "We will show driver details after assignment."}
                </p>
                <div className="tracking-eta">
                  {projection.status === "DELIVERED" ? (
                    <>
                      <Check size={22} color="var(--green)" />
                      <strong>Delivered</strong>
                    </>
                  ) : projection.etaWindow ? (
                    <>
                      <span>Estimated arrival</span>
                      <strong>
                        {formatTime(projection.etaWindow.from)}–
                        {formatTime(projection.etaWindow.to)}
                      </strong>
                    </>
                  ) : (
                    <>
                      <span>Estimated arrival</span>
                      <strong>Calculating…</strong>
                    </>
                  )}
                </div>
                <div className="tracking-steps">
                  {[
                    ["Confirmed", true],
                    [
                      "Collected",
                      [
                        "PICKED_UP",
                        "EN_ROUTE_TO_DROPOFF",
                        "ARRIVED_DROPOFF",
                        "DELIVERED",
                      ].includes(projection.status),
                    ],
                    [
                      "In transit",
                      [
                        "EN_ROUTE_TO_DROPOFF",
                        "ARRIVED_DROPOFF",
                        "DELIVERED",
                      ].includes(projection.status),
                    ],
                    ["Delivered", projection.status === "DELIVERED"],
                  ].map(([label, done]) => (
                    <div
                      className={`tracking-step ${done ? "done" : ""}`}
                      key={String(label)}
                    >
                      <i />
                      {label}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          {projection?.approximateLocation && (
            <div
              className="tracking-map"
              role="img"
              aria-label="Approximate driver location"
            >
              <div className="map-placeholder">
                <div className="river" />
                <div className="route-line" />
                <div className="map-marker" style={{ left: "67%", top: "44%" }}>
                  <span>
                    {projection.driver?.displayName.slice(0, 2).toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          )}
          <div className="tracking-note">
            For driver privacy, an approximate position appears only within one
            kilometre of your stop. It updates no more than every 30 seconds.
          </div>
        </article>
      </div>
    </main>
  );
}
