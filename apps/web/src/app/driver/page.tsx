import { Truck } from "lucide-react";
import { DriverWorkflow } from "@/components/driver-workflow";
import { requirePageMembership } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function DriverPage() {
  const { database, membership } = await requirePageMembership(["DRIVER"]);
  const driver = await database.driver.findUniqueOrThrow({
    where: { userId: membership.userId },
  });
  const delivery = await database.delivery.findFirst({
    where: {
      organizationId: membership.organizationId,
      assignedDriverId: driver.id,
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
    include: { stops: { orderBy: { sequence: "asc" } } },
    orderBy: { promisedDeliveryAt: "asc" },
  });
  return (
    <main className="tracking-page">
      <div className="tracking-shell">
        <div className="tracking-brand">
          <span className="brand-mark">
            <Truck size={17} />
          </span>
          DeliveryOS Driver
        </div>
      </div>
      <DriverWorkflow
        organizationId={membership.organizationId}
        driver={{ id: driver.id, name: driver.name, status: driver.status }}
        delivery={
          delivery
            ? {
                id: delivery.id,
                reference: delivery.reference,
                status: delivery.status,
                version: delivery.version,
                pickup: delivery.stops[0]?.addressLine1 ?? "Pickup",
                dropoff: delivery.stops[1]?.addressLine1 ?? "Drop-off",
                actualPickupAt: delivery.actualPickupAt?.toISOString() ?? null,
                actualDeliveryAt:
                  delivery.actualDeliveryAt?.toISOString() ?? null,
              }
            : null
        }
      />
    </main>
  );
}
