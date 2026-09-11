import {
  AnalyticsBoard,
  type AnalyticsSnapshot,
} from "@/components/analytics-board";
import { AppShell } from "@/components/app-shell";
import { requirePageMembership } from "@/lib/page-auth";

const activeStatuses = [
  "ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED_PICKUP",
  "PICKED_UP",
  "EN_ROUTE_TO_DROPOFF",
  "ARRIVED_DROPOFF",
] as const;

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
        status: { in: [...activeStatuses] },
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
  const initial: AnalyticsSnapshot = {
    timeZone: organization.timeZone,
    completedToday: completed.length,
    active,
    failedToday: failed,
    onTime,
    onTimeRate: completed.length
      ? Math.round((onTime / completed.length) * 100)
      : null,
    averageMinutes,
    hourly: Array.from({ length: 10 }, (_, offset) => ({
      hour: `${String(offset + 8).padStart(2, "0")}:00`,
      count: completed.filter(
        (delivery) => delivery.actualDeliveryAt?.getHours() === offset + 8,
      ).length,
    })),
  };

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
        <AnalyticsBoard organizationId={organization.id} initial={initial} />
      </div>
    </AppShell>
  );
}
