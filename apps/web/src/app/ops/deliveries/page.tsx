import type {
  DeliveryRisk,
  DeliveryStatus,
  Prisma,
} from "@deliveryos/database";
import { Filter, Plus } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { requirePageMembership } from "@/lib/page-auth";

const statuses = new Set<DeliveryStatus>([
  "UNASSIGNED",
  "ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED_PICKUP",
  "PICKED_UP",
  "EN_ROUTE_TO_DROPOFF",
  "ARRIVED_DROPOFF",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
  "RETURN_REQUIRED",
]);
const risks = new Set<DeliveryRisk>(["ON_TIME", "AT_RISK", "DELAYED"]);
const progress: Record<DeliveryStatus, number> = {
  UNASSIGNED: 4,
  ASSIGNED: 10,
  ACCEPTED: 18,
  EN_ROUTE_TO_PICKUP: 28,
  ARRIVED_PICKUP: 38,
  PICKED_UP: 50,
  EN_ROUTE_TO_DROPOFF: 72,
  ARRIVED_DROPOFF: 92,
  DELIVERED: 100,
  FAILED: 100,
  CANCELLED: 100,
  RETURN_REQUIRED: 80,
};

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; risk?: string }>;
}) {
  const { database, organization } = await requirePageMembership([
    "ADMIN",
    "DISPATCHER",
  ]);
  const filters = await searchParams;
  const status = statuses.has(filters.status as DeliveryStatus)
    ? (filters.status as DeliveryStatus)
    : undefined;
  const risk = risks.has(filters.risk as DeliveryRisk)
    ? (filters.risk as DeliveryRisk)
    : undefined;
  const query = filters.q?.trim();
  const where: Prisma.DeliveryWhereInput = {
    organizationId: organization.id,
    ...(status ? { status } : {}),
    ...(risk ? { risk } : {}),
    ...(query
      ? {
          OR: [
            { reference: { contains: query, mode: "insensitive" } },
            { customer: { name: { contains: query, mode: "insensitive" } } },
            {
              assignedDriver: {
                name: { contains: query, mode: "insensitive" },
              },
            },
            { externalReference: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const deliveries = await database.delivery.findMany({
    where,
    include: {
      customer: { select: { name: true } },
      assignedDriver: { select: { name: true } },
      stops: { orderBy: { sequence: "asc" } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: organization.timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <AppShell active="Deliveries" trail="Deliveries">
      <div className="content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Dispatch queue</p>
            <h1>Deliveries</h1>
            <p className="subtitle">
              Create, assign, and monitor every job from one operational view.
            </p>
          </div>
          <Link href="/ops/deliveries/new" className="button primary">
            <Plus /> Create delivery
          </Link>
        </div>
        <div className="table-card">
          <form className="toolbar" method="get">
            <input
              className="search"
              name="q"
              defaultValue={query}
              aria-label="Search deliveries"
              placeholder="Search reference, customer, driver…"
            />
            <select
              className="select"
              name="status"
              defaultValue={status ?? ""}
              aria-label="Status filter"
            >
              <option value="">All statuses</option>
              {[...statuses].map((value) => (
                <option value={value} key={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <select
              className="select"
              name="risk"
              defaultValue={risk ?? ""}
              aria-label="Risk filter"
            >
              <option value="">All risk</option>
              {[...risks].map((value) => (
                <option value={value} key={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <button type="submit" className="button secondary">
              <Filter size={14} /> Apply filters
            </button>
          </form>
          <table>
            <thead>
              <tr>
                <th>Delivery</th>
                <th>Journey</th>
                <th>Driver</th>
                <th>Status</th>
                <th>Risk</th>
                <th>ETA</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td>
                    <Link href={`/ops/deliveries/${delivery.id}`}>
                      <strong>
                        {delivery.externalReference
                          ? `${delivery.externalReference} · #${delivery.reference}`
                          : `#${delivery.reference}`}
                      </strong>
                      <span className="td-sub">{delivery.customer.name}</span>
                    </Link>
                  </td>
                  <td>
                    <strong>
                      {delivery.stops[0]?.addressLine1 ?? "Pickup"}
                    </strong>
                    <span className="td-sub">
                      to {delivery.stops.at(-1)?.addressLine1 ?? "Drop-off"}
                      {delivery.stops.length > 2
                        ? ` · ${delivery.stops.length} stops`
                        : ""}
                    </span>
                    <div className="progress">
                      <i style={{ width: `${progress[delivery.status]}%` }} />
                    </div>
                  </td>
                  <td>{delivery.assignedDriver?.name ?? "Unassigned"}</td>
                  <td>
                    <StatusBadge value={delivery.status} />
                  </td>
                  <td>
                    <StatusBadge value={delivery.risk} />
                  </td>
                  <td>
                    <strong>
                      {delivery.currentEtaAt
                        ? time.format(delivery.currentEtaAt)
                        : "—"}
                    </strong>
                  </td>
                </tr>
              ))}
              {deliveries.length === 0 && (
                <tr>
                  <td colSpan={6}>No deliveries match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
