"use client";

import { StatusBadge } from "@/components/status-badge";
import { useLiveResource } from "@/lib/use-live-resource";
import { humanise } from "@/lib/utils";

type HistoryEvent = {
  id: string;
  eventType: string;
  aggregateType: string;
  actorType: string;
  occurredAt: string;
  delivery: { reference: string } | null;
  driver: { name: string } | null;
};

export function HistoryFeed({
  organizationId,
  timeZone,
  initialEvents,
}: {
  organizationId: string;
  timeZone: string;
  initialEvents: HistoryEvent[];
}) {
  const { data } = useLiveResource<HistoryEvent[]>(
    `/api/v1/organizations/${organizationId}/operations/events`,
    4_000,
  );
  const events = data ?? initialEvents;
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return (
    <article className="card">
      <div className="timeline" style={{ paddingTop: 20 }}>
        {events.map((event, index) => (
          <div className="timeline-row" key={event.id}>
            <time>{time.format(new Date(event.occurredAt))}</time>
            <div className="timeline-track">
              <div className={`timeline-dot ${index === 0 ? "current" : ""}`} />
            </div>
            <div className="timeline-copy">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <strong>
                  {humanise(event.eventType.replaceAll(".", "_"))}
                </strong>
                {index === 0 && <StatusBadge value="LIVE" />}
              </div>
              <p>
                {event.delivery
                  ? `Delivery #${event.delivery.reference}`
                  : (event.driver?.name ?? humanise(event.aggregateType))}{" "}
                · {humanise(event.actorType)}
              </p>
            </div>
          </div>
        ))}
        {events.length === 0 && (
          <p className="subtitle" style={{ padding: "0 20px 20px" }}>
            No operational events yet.
          </p>
        )}
      </div>
    </article>
  );
}
