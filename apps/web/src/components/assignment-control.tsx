"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AssignmentControl({
  organizationId,
  delivery,
  drivers,
}: {
  organizationId: string;
  delivery: {
    id: string;
    status: string;
    version: number;
    assignedDriverId: string | null;
  };
  drivers: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [driverId, setDriverId] = useState(drivers[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!(["UNASSIGNED", "ASSIGNED"] as string[]).includes(delivery.status))
    return null;

  async function submit(command: "assign" | "unassign") {
    setPending(true);
    setError(null);
    const response = await fetch(
      `/api/v1/organizations/${organizationId}/deliveries/${delivery.id}/commands/${command}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          expectedVersion: delivery.version,
          ...(command === "assign" ? { driverId } : {}),
        }),
      },
    );
    const body = await response.json();
    if (!response.ok)
      setError(body.error?.message ?? "Assignment could not be updated.");
    else router.refresh();
    setPending(false);
  }

  return (
    <div className="card" style={{ padding: 14, marginBottom: 14 }}>
      <span className="label">Dispatch assignment</span>
      {delivery.status === "UNASSIGNED" ? (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <select
            className="select"
            aria-label="Select driver"
            value={driverId}
            onChange={(event) => setDriverId(event.target.value)}
          >
            {drivers.map((driver) => (
              <option value={driver.id} key={driver.id}>
                {driver.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="button primary"
            disabled={pending || !driverId}
            onClick={() => submit("assign")}
          >
            {pending ? "Assigning…" : "Assign"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="button secondary"
          style={{ marginTop: 8 }}
          disabled={pending}
          onClick={() => submit("unassign")}
        >
          {pending ? "Unassigning…" : "Unassign delivery"}
        </button>
      )}
      {error && <p style={{ color: "var(--red)", marginTop: 8 }}>{error}</p>}
    </div>
  );
}
