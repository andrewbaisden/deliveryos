import { AppShell } from "@/components/app-shell";
import { HistoryFeed } from "@/components/history-feed";
import { requirePageMembership } from "@/lib/page-auth";

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
        <HistoryFeed
          organizationId={organization.id}
          timeZone={organization.timeZone}
          initialEvents={events.map((event) => ({
            id: event.id,
            eventType: event.eventType,
            aggregateType: event.aggregateType,
            actorType: event.actorType,
            occurredAt: event.occurredAt.toISOString(),
            delivery: event.delivery,
            driver: event.driver,
          }))}
        />
      </div>
    </AppShell>
  );
}
