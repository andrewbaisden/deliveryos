import { classifyFreshness } from "@deliveryos/domain";
import { UserPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { requirePageMembership } from "@/lib/page-auth";

export default async function DriversPage() {
  const { database, organization } = await requirePageMembership([
    "ADMIN",
    "DISPATCHER",
  ]);
  const drivers = await database.driver.findMany({
    where: { organizationId: organization.id },
    include: {
      zone: { select: { name: true } },
      snapshots: { orderBy: { observedAt: "desc" }, take: 1 },
      _count: {
        select: {
          assignedDeliveries: {
            where: {
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
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });
  const now = new Date();
  return (
    <AppShell active="Drivers" trail="Drivers">
      <div className="content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Fleet availability</p>
            <h1>Drivers</h1>
            <p className="subtitle">
              Live capacity and location freshness across the active fleet.
            </p>
          </div>
          <button type="button" className="button primary">
            <UserPlus /> Add driver
          </button>
        </div>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Driver</th>
                <th>Operational state</th>
                <th>Presence</th>
                <th>Zone</th>
                <th>Current load</th>
                <th>Telemetry</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver) => {
                const observedAt = driver.snapshots[0]?.observedAt;
                const presence = observedAt
                  ? classifyFreshness(observedAt, now)
                  : "OFFLINE";
                const ageSeconds = observedAt
                  ? Math.max(
                      0,
                      Math.floor(
                        (now.getTime() - observedAt.getTime()) / 1_000,
                      ),
                    )
                  : null;
                return (
                  <tr key={driver.id}>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <span className="avatar">
                          {driver.name
                            .split(" ")
                            .map((part) => part[0])
                            .join("")}
                        </span>
                        <div>
                          <strong>{driver.name}</strong>
                          <span className="td-sub">
                            Driver {driver.id.slice(-4)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <StatusBadge value={driver.status} />
                    </td>
                    <td>
                      <StatusBadge value={presence} />
                    </td>
                    <td>{driver.zone?.name ?? "Unzoned"}</td>
                    <td>
                      {driver._count.assignedDeliveries} /{" "}
                      {driver.maxConcurrentDeliveries}
                    </td>
                    <td>
                      {ageSeconds === null
                        ? "No telemetry"
                        : ageSeconds < 5
                          ? "Just now"
                          : `${ageSeconds} sec ago`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
