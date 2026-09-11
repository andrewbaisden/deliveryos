import { classifyFreshness } from "@deliveryos/domain";
import { AppShell } from "@/components/app-shell";
import { DriversManager } from "@/components/drivers-manager";
import { requirePageMembership } from "@/lib/page-auth";

export default async function DriversPage() {
  const { database, organization } = await requirePageMembership([
    "ADMIN",
    "DISPATCHER",
  ]);
  const [drivers, zones] = await Promise.all([
    database.driver.findMany({
      where: { organizationId: organization.id },
      include: {
        zone: { select: { id: true, name: true } },
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
    }),
    database.zone.findMany({
      where: { organizationId: organization.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const now = new Date();
  return (
    <AppShell active="Drivers" trail="Drivers">
      <div className="content">
        <DriversManager
          organizationId={organization.id}
          zones={zones}
          drivers={drivers.map((driver) => {
            const observedAt = driver.snapshots[0]?.observedAt;
            const presence = observedAt
              ? classifyFreshness(observedAt, now)
              : "OFFLINE";
            const ageSeconds = observedAt
              ? Math.max(
                  0,
                  Math.floor((now.getTime() - observedAt.getTime()) / 1_000),
                )
              : null;
            return {
              id: driver.id,
              name: driver.name,
              status: driver.status,
              userId: driver.userId,
              maxConcurrentDeliveries: driver.maxConcurrentDeliveries,
              zone: driver.zone,
              presence,
              activeLoad: driver._count.assignedDeliveries,
              telemetryLabel:
                ageSeconds === null
                  ? "No telemetry"
                  : ageSeconds < 5
                    ? "Just now"
                    : `${ageSeconds} sec ago`,
            };
          })}
        />
      </div>
    </AppShell>
  );
}
