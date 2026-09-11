import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { requirePageMembership } from "@/lib/page-auth";
import { humanise } from "@/lib/utils";

export default async function HistoryPage() {
  const { database, organization } = await requirePageMembership([
    "ADMIN",
    "DISPATCHER",
  ]);
  const events = await database.domainEvent.findMany({
    where: { organizationId: organization.id },
    include: {
      delivery: { select: { reference: true } },
      driver: { select: { name: true } },
    },
    orderBy: { sequence: "desc" },
    take: 100,
  });
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: organization.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return (
    <AppShell active="History" trail="History">
      <div className="content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Audit trail</p>
            <h1>Operational history</h1>
            <p className="subtitle">
              An immutable account of delivery, driver, and system activity.
            </p>
          </div>
        </div>
        <article className="card">
          <div className="timeline" style={{ paddingTop: 20 }}>
            {events.map((event, index) => (
              <div className="timeline-row" key={event.id}>
                <time>{time.format(event.occurredAt)}</time>
                <div className="timeline-track">
                  <div
                    className={`timeline-dot ${index === 0 ? "current" : ""}`}
                  />
                </div>
                <div className="timeline-copy">
                  <div
                    style={{ display: "flex", gap: 8, alignItems: "center" }}
                  >
                    <strong>
                      {humanise(event.eventType.replaceAll(".", "_"))}
                    </strong>
                    {index === 0 && <StatusBadge value="LIVE" />}
                  </div>
                  <p>
                    {event.delivery
                      ? `Delivery #${event.delivery.reference}`
                      : (event.driver?.name ??
                        humanise(event.aggregateType))}{" "}
                    · {humanise(event.actorType)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </AppShell>
  );
}
