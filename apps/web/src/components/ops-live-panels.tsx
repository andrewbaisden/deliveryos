"use client";

import { AlertTriangle, CircleAlert } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { useLiveResource } from "@/lib/use-live-resource";

type LiveSnapshot = {
  alerts: Array<{
    id: string;
    message: string;
    type: string;
    severity: string;
  }>;
  drivers: Array<{
    id: string;
    name: string;
    status: string;
    activeLoad: number;
    maxConcurrentDeliveries: number;
    zone: { name: string } | null;
  }>;
};

export function OpsLivePanels({
  organizationId,
  initial,
}: {
  organizationId: string;
  initial: LiveSnapshot;
}) {
  const { data } = useLiveResource<LiveSnapshot>(
    `/api/v1/organizations/${organizationId}/operations/snapshot`,
    5_000,
  );
  const snapshot = data ?? initial;
  const alerts = snapshot.alerts.slice(0, 3);
  const drivers = snapshot.drivers.slice(0, 4);

  return (
    <div className="stack">
      <article className="card">
        <div className="card-head">
          <div>
            <h2>Needs attention</h2>
            <p>{snapshot.alerts.length} open operational alerts</p>
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
            <p>{snapshot.drivers.length} fleet members shown</p>
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
                  {driver.zone?.name ?? "Unzoned"} · {driver.activeLoad}/
                  {driver.maxConcurrentDeliveries} load
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
  );
}
