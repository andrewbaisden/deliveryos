import { ArrowLeft, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AssignmentControl } from "@/components/assignment-control";
import { FleetMap } from "@/components/fleet-map";
import { StatusBadge } from "@/components/status-badge";
import { requirePageMembership } from "@/lib/page-auth";
import { humanise } from "@/lib/utils";

export default async function DeliveryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { database, organization } = await requirePageMembership([
    "ADMIN",
    "DISPATCHER",
  ]);
  const delivery = await database.delivery.findFirst({
    where: { id, organizationId: organization.id },
    include: {
      customer: true,
      assignedDriver: true,
      stops: { orderBy: { sequence: "asc" } },
      events: { orderBy: { sequence: "desc" }, take: 100 },
    },
  });
  if (!delivery) notFound();
  const availableDrivers =
    delivery.status === "UNASSIGNED"
      ? await database.driver.findMany({
          where: {
            organizationId: organization.id,
            status: { in: ["AVAILABLE", "ASSIGNED"] },
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [];
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: organization.timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <AppShell active="Deliveries" trail={`Delivery #${delivery.reference}`}>
      <div className="content">
        <div className="page-heading">
          <div>
            <Link href="/ops/deliveries" className="back-link">
              <ArrowLeft size={12} /> All deliveries
            </Link>
            <h1>Delivery #{delivery.reference}</h1>
            <p className="subtitle">
              {delivery.customer.name} · Created{" "}
              {time.format(delivery.createdAt)}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <StatusBadge value={delivery.risk} />
            <StatusBadge value={delivery.status} />
            <button
              type="button"
              className="icon-button"
              aria-label="More actions"
            >
              <MoreHorizontal size={15} />
            </button>
          </div>
        </div>
        <div className="detail-grid">
          <div className="stack">
            <article className="card">
              <div className="card-head">
                <div>
                  <h2>Route progress</h2>
                  <p>{humanise(delivery.status)}</p>
                </div>
                <strong style={{ color: "var(--green)", fontSize: 13 }}>
                  {delivery.currentEtaAt
                    ? `ETA ${time.format(delivery.currentEtaAt)}`
                    : "ETA pending"}
                </strong>
              </div>
              <FleetMap organizationId={organization.id} />
            </article>
            <article className="card">
              <div className="card-head">
                <h2>Delivery details</h2>
              </div>
              <div className="info-grid">
                <div>
                  <span className="label">Customer</span>
                  <span className="value">{delivery.customer.name}</span>
                </div>
                <div>
                  <span className="label">Driver</span>
                  <span className="value">
                    {delivery.assignedDriver?.name ?? "Unassigned"}
                  </span>
                </div>
                <div>
                  <span className="label">Priority</span>
                  <span className="value">{humanise(delivery.priority)}</span>
                </div>
                <div>
                  <span className="label">Pickup</span>
                  <span className="value">
                    {delivery.stops[0]?.addressLine1 ?? "—"}
                  </span>
                </div>
                <div>
                  <span className="label">Route</span>
                  <span className="value">
                    {delivery.externalReference ?? "—"}
                  </span>
                </div>
                <div>
                  <span className="label">Drop-off</span>
                  <span className="value">
                    {delivery.stops.at(-1)?.addressLine1 ?? "—"}
                  </span>
                </div>
                <div>
                  <span className="label">Promise</span>
                  <span className="value">
                    {time.format(delivery.promisedDeliveryAt)}
                  </span>
                </div>
              </div>
            </article>
          </div>
          <aside className="card">
            <AssignmentControl
              organizationId={organization.id}
              delivery={{
                id: delivery.id,
                status: delivery.status,
                version: delivery.version,
                assignedDriverId: delivery.assignedDriverId,
              }}
              drivers={availableDrivers}
            />
            <div className="card-head">
              <div>
                <h2>Operational timeline</h2>
                <p>Immutable delivery events</p>
              </div>
            </div>
            <div className="timeline">
              {delivery.events.map((event, index) => (
                <div className="timeline-row" key={event.id}>
                  <time>{time.format(event.occurredAt)}</time>
                  <div className="timeline-track">
                    <div
                      className={`timeline-dot ${index === 0 ? "current" : ""}`}
                    />
                  </div>
                  <div className="timeline-copy">
                    <strong>
                      {humanise(event.eventType.replaceAll(".", "_"))}
                    </strong>
                    <p>{humanise(event.actorType)} action</p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
