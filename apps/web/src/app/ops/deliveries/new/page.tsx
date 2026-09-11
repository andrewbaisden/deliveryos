import { AppShell } from "@/components/app-shell";
import { CreateDeliveryForm } from "@/components/create-delivery-form";
import { requirePageMembership } from "@/lib/page-auth";

export default async function NewDeliveryPage() {
  const { membership } = await requirePageMembership(["ADMIN", "DISPATCHER"]);
  return (
    <AppShell active="Deliveries" trail="New delivery">
      <div className="content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">New job</p>
            <h1>Create delivery</h1>
            <p className="subtitle">
              Capture the customer promise and two-stop journey.
            </p>
          </div>
        </div>
        <CreateDeliveryForm organizationId={membership.organizationId} />
      </div>
    </AppShell>
  );
}
