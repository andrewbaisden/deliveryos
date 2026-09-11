import {
  BarChart3,
  CheckCircle2,
  Clock3,
  PackageCheck,
  TriangleAlert,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requirePageMembership } from "@/lib/page-auth";

export default async function AnalyticsPage() {
  const { database, organization } = await requirePageMembership([
    "ADMIN",
    "DISPATCHER",
  ]);
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const completed = await database.delivery.findMany({
    where: {
      organizationId: organization.id,
      actualDeliveryAt: { gte: startOfDay },
    },
    select: { actualDeliveryAt: true, plannedPickupAt: true, risk: true },
  });
  const [active, failed] = await Promise.all([
    database.delivery.count({
      where: {
        organizationId: organization.id,
        status: {
          in: [
            "ASSIGNED",
            "ACCEPTED",
            "EN_ROUTE_TO_PICKUP",
            "ARRIVED_PICKUP",
            "PICKED_UP",
            "EN_ROUTE_TO_DROPOFF",
            "ARRIVED_DROPOFF",
          ],
        },
      },
    }),
    database.delivery.count({
      where: {
        organizationId: organization.id,
        status: "FAILED",
        updatedAt: { gte: startOfDay },
      },
    }),
  ]);
  const averageMinutes = completed.length
    ? Math.round(
        completed.reduce(
          (sum, delivery) =>
            sum +
            ((delivery.actualDeliveryAt?.getTime() ?? now.getTime()) -
              delivery.plannedPickupAt.getTime()) /
              60_000,
          0,
        ) / completed.length,
      )
    : 0;
  const onTime = completed.filter(
    (delivery) => delivery.risk !== "DELAYED",
  ).length;
  const analytics = [
    [
      "On-time rate",
      completed.length
        ? `${Math.round((onTime / completed.length) * 100)}%`
        : "—",
      `${onTime} of ${completed.length} completed`,
      CheckCircle2,
    ],
    [
      "Avg delivery time",
      completed.length ? `${averageMinutes}m` : "—",
      "Pickup plan to completion",
      Clock3,
    ],
    [
      "Completed today",
      String(completed.length),
      `${active} still active`,
      PackageCheck,
    ],
    ["Failed today", String(failed), "Operational failures", TriangleAlert],
  ] as const;
  const hourly = Array.from({ length: 10 }, (_, offset) => ({
    hour: `${String(offset + 8).padStart(2, "0")}:00`,
    count: completed.filter(
      (delivery) => delivery.actualDeliveryAt?.getHours() === offset + 8,
    ).length,
  }));
  const maximum = Math.max(1, ...hourly.map(({ count }) => count));

  return (
    <AppShell active="Analytics" trail="Analytics">
      <div className="content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Service performance</p>
            <h1>Analytics</h1>
            <p className="subtitle">
              Operational measures derived from authoritative delivery outcomes.
            </p>
          </div>
          <span className="button secondary">
            Today · {organization.timeZone}
          </span>
        </div>
        <div
          className="metric-grid"
          style={{ gridTemplateColumns: "repeat(4,1fr)" }}
        >
          {analytics.map(([label, value, detail, Icon]) => (
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
            {hourly.map(({ hour, count }) => (
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
      </div>
    </AppShell>
  );
}
