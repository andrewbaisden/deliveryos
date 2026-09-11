import {
  AlertTriangle,
  ArrowRight,
  Box,
  CircleAlert,
  Clock3,
  Plus,
  Truck,
  UserRoundCheck,
} from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { FleetMap } from "@/components/fleet-map";
import { StatusBadge } from "@/components/status-badge";
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

export default async function OperationsPage() {
  const { database, organization, session } = await requirePageMembership([
    "ADMIN",
    "DISPATCHER",
  ]);
  const [
    activeDrivers,
    activeDeliveries,
    unassigned,
    atRisk,
    delayed,
    alerts,
    drivers,
  ] = await Promise.all([
    database.driver.count({
      where: {
        organizationId: organization.id,
        status: { in: ["AVAILABLE", "ASSIGNED", "ON_DELIVERY"] },
      },
    }),
    database.delivery.count({
      where: {
        organizationId: organization.id,
        status: { in: [...activeStatuses] },
      },
    }),
    database.delivery.count({
      where: { organizationId: organization.id, status: "UNASSIGNED" },
    }),
    database.delivery.count({
      where: {
        organizationId: organization.id,
        status: { in: [...activeStatuses] },
        risk: "AT_RISK",
      },
    }),
    database.delivery.count({
      where: {
        organizationId: organization.id,
        status: { in: [...activeStatuses] },
        risk: "DELAYED",
      },
    }),
    database.operationalAlert.findMany({
      where: { organizationId: organization.id, status: "OPEN" },
      orderBy: [{ severity: "desc" }, { openedAt: "desc" }],
      take: 3,
    }),
    database.driver.findMany({
      where: { organizationId: organization.id },
      include: { zone: { select: { name: true } } },
      orderBy: { name: "asc" },
      take: 4,
    }),
  ]);
  const metrics = [
    ["Active drivers", String(activeDrivers), "Available or working", Truck],
    [
      "Active deliveries",
      String(activeDeliveries),
      "Across the live operation",
      Box,
    ],
    ["Unassigned", String(unassigned), "Waiting for dispatch", UserRoundCheck],
    ["At risk", String(atRisk), "Within 10 min of promise", Clock3],
    ["Delayed", String(delayed), "Requires attention", AlertTriangle],
  ] as const;
  const today = new Intl.DateTimeFormat("en-GB", {
    timeZone: organization.timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <AppShell>
      <div className="content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">{today}</p>
            <h1>Good to see you, {session.user.name.split(" ")[0]}.</h1>
            <p className="subtitle">
              Here is how the operation is moving right now.
            </p>
          </div>
          <Link href="/ops/deliveries/new" className="button primary">
            <Plus /> Create delivery
          </Link>
        </div>
        <section
          className="metric-grid"
          aria-label="Current operational metrics"
        >
          {metrics.map(([label, value, detail, Icon], index) => (
            <article
              className={`metric ${index === 4 ? "alert" : ""}`}
              key={label}
            >
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
        </section>
        <section className="ops-grid">
          <article className="card">
            <div className="card-head">
              <div>
                <h2>Live fleet</h2>
                <p>{activeDrivers} active · authoritative snapshot</p>
              </div>
              <Link href="/ops/drivers" className="button secondary">
                Open fleet <ArrowRight />
              </Link>
            </div>
            <FleetMap organizationId={organization.id} />
          </article>
          <div className="stack">
            <article className="card">
              <div className="card-head">
                <div>
                  <h2>Needs attention</h2>
                  <p>{alerts.length} open operational alerts</p>
                </div>
                <CircleAlert size={16} color="#b6493d" />
              </div>
              <ul className="alert-list">
                {alerts.map((alert) => (
                  <li className="alert-row" key={alert.id}>
                    <span className="alert-symbol red">
                      <AlertTriangle />
                    </span>
                    <div>
                      <strong>{alert.message}</strong>
                      <p>{alert.type.replaceAll("_", " ")}</p>
                    </div>
                    <StatusBadge value={alert.severity} />
                  </li>
                ))}
                {alerts.length === 0 && (
                  <li className="alert-row">
                    <div>
                      <strong>No open alerts</strong>
                      <p>The operation is within configured thresholds.</p>
                    </div>
                  </li>
                )}
              </ul>
            </article>
            <article className="card">
              <div className="card-head">
                <div>
                  <h2>Driver capacity</h2>
                  <p>{drivers.length} fleet members shown</p>
                </div>
                <Link href="/ops/drivers" className="inline-link">
                  View all
                </Link>
              </div>
              <ul className="driver-list">
                {drivers.map((driver) => (
                  <li className="driver-row" key={driver.id}>
                    <span className="avatar">
                      {driver.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")}
                    </span>
                    <div>
                      <strong>{driver.name}</strong>
                      <p>
                        {driver.zone?.name ?? "Unzoned"} · Driver{" "}
                        {driver.id.slice(-4)}
                      </p>
                    </div>
                    <div className="driver-meta">
                      <StatusBadge value={driver.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
