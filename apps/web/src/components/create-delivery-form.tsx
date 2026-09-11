"use client";

import { createDeliverySchema } from "@deliveryos/contracts";
import { ArrowRight, MapPin, PackageCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateDeliveryForm({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const now = Date.now();
    const payload = {
      customer: {
        name: form.get("customer"),
        email: form.get("email") || undefined,
      },
      priority: form.get("priority"),
      packageCount: Number(form.get("packageCount")),
      plannedPickupAt: new Date(now + 15 * 60_000).toISOString(),
      promisedDeliveryAt: new Date(now + 90 * 60_000).toISOString(),
      instructions: form.get("instructions") || undefined,
      stops: [
        {
          kind: "PICKUP",
          addressLine1: form.get("pickup"),
          city: "London",
          postalCode: form.get("pickupPostcode"),
        },
        {
          kind: "DROPOFF",
          addressLine1: form.get("dropoff"),
          city: "London",
          postalCode: form.get("dropoffPostcode"),
        },
      ],
    };
    const parsed = createDeliverySchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the delivery details");
      return;
    }
    setPending(true);
    const response = await fetch(
      `/api/v1/organizations/${organizationId}/deliveries`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(parsed.data),
      },
    );
    const body = await response.json();
    setPending(false);
    if (!response.ok) {
      setError(body.error?.message ?? "Could not create delivery");
      return;
    }
    router.push(`/ops/deliveries/${body.data.id}`);
    router.refresh();
  }

  return (
    <form className="detail-grid" onSubmit={submit}>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Customer and journey</h2>
            <p>
              Addresses are geocoded on the server. Mapbox is used when{" "}
              <code>MAPBOX_SECRET_TOKEN</code> is set; otherwise the East and
              Central London fixture resolver is used.
            </p>
          </div>
          <MapPin size={17} color="var(--green)" />
        </div>
        <div style={{ padding: 20 }}>
          <div
            className="info-grid"
            style={{ padding: 0, gridTemplateColumns: "1fr 1fr" }}
          >
            <div className="form-field">
              <label htmlFor="customer">Customer name</label>
              <input
                required
                id="customer"
                name="customer"
                placeholder="Owen & Co."
              />
            </div>
            <div className="form-field">
              <label htmlFor="email">Customer email</label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="ops@example.com"
              />
            </div>
            <div className="form-field">
              <label htmlFor="pickup">Pickup address</label>
              <input
                required
                id="pickup"
                name="pickup"
                placeholder="Stratford City"
              />
            </div>
            <div className="form-field">
              <label htmlFor="pickupPostcode">Pickup postcode</label>
              <input
                required
                id="pickupPostcode"
                name="pickupPostcode"
                placeholder="E20 1EJ"
              />
            </div>
            <div className="form-field">
              <label htmlFor="dropoff">Drop-off address</label>
              <input
                required
                id="dropoff"
                name="dropoff"
                placeholder="Covent Garden"
              />
            </div>
            <div className="form-field">
              <label htmlFor="dropoffPostcode">Drop-off postcode</label>
              <input
                required
                id="dropoffPostcode"
                name="dropoffPostcode"
                placeholder="WC2E 8RF"
              />
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="instructions">Internal instructions</label>
            <input
              id="instructions"
              name="instructions"
              placeholder="Loading bay access from the rear"
            />
          </div>
        </div>
      </section>
      <aside className="card" style={{ alignSelf: "start" }}>
        <div className="card-head">
          <div>
            <h2>Delivery settings</h2>
            <p>Initial operational constraints</p>
          </div>
          <PackageCheck size={17} color="var(--green)" />
        </div>
        <div style={{ padding: 20 }}>
          <div className="form-field">
            <label htmlFor="priority">Priority</label>
            <select
              className="select"
              style={{ width: "100%" }}
              id="priority"
              name="priority"
            >
              <option value="STANDARD">Standard</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="packageCount">Package count</label>
            <input
              id="packageCount"
              name="packageCount"
              type="number"
              min="1"
              max="100"
              defaultValue="1"
            />
          </div>
          {error && (
            <p style={{ color: "var(--red)", fontSize: 10 }}>{error}</p>
          )}
          <button
            type="submit"
            className="button primary"
            style={{ width: "100%" }}
            disabled={pending}
          >
            {pending ? (
              "Creating…"
            ) : (
              <>
                Create delivery <ArrowRight />
              </>
            )}
          </button>
        </div>
      </aside>
    </form>
  );
}
