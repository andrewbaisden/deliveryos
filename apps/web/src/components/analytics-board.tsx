"use client";

import {
  BarChart3,
  CheckCircle2,
  Clock3,
  PackageCheck,
  TriangleAlert,
} from "lucide-react";
import { useLiveResource } from "@/lib/use-live-resource";

export type AnalyticsSnapshot = {
  timeZone: string;
  completedToday: number;
  active: number;
  failedToday: number;
  onTime: number;
  onTimeRate: number | null;
  averageMinutes: number;
  hourly: Array<{ hour: string; count: number }>;
};

export function AnalyticsBoard({
  organizationId,
  initial,
}: {
  organizationId: string;
  initial: AnalyticsSnapshot;
}) {
  const { data } = useLiveResource<AnalyticsSnapshot>(
    `/api/v1/organizations/${organizationId}/operations/analytics`,
    8_000,
  );
  const analytics = data ?? initial;
  const cards = [
    [
      "On-time rate",
      analytics.onTimeRate === null ? "—" : `${analytics.onTimeRate}%`,
      `${analytics.onTime} of ${analytics.completedToday} completed`,
      CheckCircle2,
    ],
    [
      "Avg delivery time",
      analytics.completedToday ? `${analytics.averageMinutes}m` : "—",
      "Pickup plan to completion",
      Clock3,
    ],
    [
      "Completed today",
      String(analytics.completedToday),
      `${analytics.active} still active`,
      PackageCheck,
    ],
    [
      "Failed today",
      String(analytics.failedToday),
      "Operational failures",
      TriangleAlert,
    ],
  ] as const;
  const maximum = Math.max(1, ...analytics.hourly.map(({ count }) => count));

  return (
    <>
      <div
        className="metric-grid"
        style={{ gridTemplateColumns: "repeat(4,1fr)" }}
      >
        {cards.map(([label, value, detail, Icon]) => (
          <article className="metric" key={label}>
            <div className="metric-top">
              <span>{label}</span>
              <span className="metric-icon">
                <Icon />
              </span>
            </div>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </div>
      <article className="card" style={{ padding: 22 }}>
        <div className="card-head" style={{ padding: 0, border: 0 }}>
          <div>
            <h2>Deliveries by hour</h2>
            <p>Completed delivery volume</p>
          </div>
          <BarChart3 size={18} color="var(--green)" />
        </div>
        <div
          style={{
            height: 260,
            display: "flex",
            alignItems: "end",
            gap: "3%",
            padding: "30px 15px 10px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          {analytics.hourly.map(({ hour, count }) => (
            <div
              key={hour}
              style={{
                flex: 1,
                minHeight: 2,
                height: `${Math.max(2, (count / maximum) * 100)}%`,
                background: "var(--green)",
                borderRadius: "5px 5px 0 0",
                opacity: 0.85,
              }}
              title={`${hour}: ${count}`}
            />
          ))}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: "var(--muted)",
            fontSize: 9,
            padding: "8px 15px 0",
          }}
        >
          <span>08:00</span>
          <span>12:00</span>
          <span>17:00</span>
        </div>
      </article>
    </>
  );
}
