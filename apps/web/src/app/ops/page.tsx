import {
  AlertTriangle,
  ArrowRight,
  Box,
  Clock3,
  Plus,
  Truck,
  UserRoundCheck,
} from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { FleetMap } from "@/components/fleet-map";
import { OpsLivePanels } from "@/components/ops-live-panels";
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
      where: {
        organizationId: organization.id,
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
      },
      orderBy: [{ severity: "desc" }, { openedAt: "desc" }],
    }),
    database.driver.findMany({
      where: { organizationId: organization.id },
      include: {
        zone: { select: { name: true } },
        _count: {
          select: {
            assignedDeliveries: {
              where: { status: { in: [...activeStatuses] } },
            },
          },
        },
      },
      orderBy: { name: "asc" },
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
          <OpsLivePanels
            organizationId={organization.id}
            initial={{
              alerts: alerts.map((alert) => ({
                id: alert.id,
                message: alert.message,
                type: alert.type,
                severity: alert.severity,
              })),
              drivers: drivers.map((driver) => ({
                id: driver.id,
                name: driver.name,
                status: driver.status,
                activeLoad: driver._count.assignedDeliveries,
                maxConcurrentDeliveries: driver.maxConcurrentDeliveries,
                zone: driver.zone,
              })),
            }}
          />
        </section>
      </div>
    </AppShell>
  );
}
