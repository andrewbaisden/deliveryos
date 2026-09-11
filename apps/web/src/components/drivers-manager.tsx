"use client";

import { Pencil, Trash2, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";

type DriverRow = {
  id: string;
  name: string;
  status: string;
  userId: string | null;
  maxConcurrentDeliveries: number;
  zone: { id: string; name: string } | null;
  presence: string;
  telemetryLabel: string;
  activeLoad: number;
};

type ZoneOption = { id: string; name: string };

type DriverForm = {
  name: string;
  zoneId: string;
  maxConcurrentDeliveries: string;
  status: "AVAILABLE" | "OFFLINE" | "ON_BREAK";
};

const emptyForm: DriverForm = {
  name: "",
  zoneId: "",
  maxConcurrentDeliveries: "1",
  status: "AVAILABLE",
};

export function DriversManager({
  organizationId,
  drivers,
  zones,
}: {
  organizationId: string;
  drivers: DriverRow[];
  zones: ZoneOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<"create" | "edit" | "delete" | null>(null);
  const [selected, setSelected] = useState<DriverRow | null>(null);
  const [form, setForm] = useState<DriverForm>(emptyForm);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startCreate() {
    setSelected(null);
    setForm({
      ...emptyForm,
      zoneId: zones[0]?.id ?? "",
    });
    setError(null);
    setOpen("create");
  }

  function startEdit(driver: DriverRow) {
    setSelected(driver);
    setForm({
      name: driver.name,
      zoneId: driver.zone?.id ?? "",
      maxConcurrentDeliveries: String(driver.maxConcurrentDeliveries),
      status:
        driver.status === "OFFLINE" || driver.status === "ON_BREAK"
          ? driver.status
          : "AVAILABLE",
    });
    setError(null);
    setOpen("edit");
  }

  function startDelete(driver: DriverRow) {
    setSelected(driver);
    setError(null);
    setOpen("delete");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      zoneId: form.zoneId || null,
      maxConcurrentDeliveries: Number(form.maxConcurrentDeliveries),
      status: form.status,
    };
    const creating = open === "create";
    const response = await fetch(
      creating
        ? `/api/v1/organizations/${organizationId}/drivers`
        : `/api/v1/organizations/${organizationId}/drivers/${selected?.id}`,
      {
        method: creating ? "POST" : "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(
          creating
            ? payload
            : {
                name: payload.name,
                zoneId: payload.zoneId,
                maxConcurrentDeliveries: payload.maxConcurrentDeliveries,
                ...(selected &&
                ["AVAILABLE", "OFFLINE", "ON_BREAK"].includes(selected.status)
                  ? { status: payload.status }
                  : {}),
              },
        ),
      },
    );
    const body = (await response.json()) as { error?: { message?: string } };
    setPending(false);
    if (!response.ok) {
      setError(body.error?.message ?? "Driver could not be saved");
      return;
    }
    setOpen(null);
    router.refresh();
  }

  async function confirmDelete() {
    if (!selected) return;
    setPending(true);
    setError(null);
    const response = await fetch(
      `/api/v1/organizations/${organizationId}/drivers/${selected.id}`,
      {
        method: "DELETE",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      },
    );
    const body = (await response.json()) as { error?: { message?: string } };
    setPending(false);
    if (!response.ok) {
      setError(body.error?.message ?? "Driver could not be removed");
      return;
    }
    setOpen(null);
    router.refresh();
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Fleet availability</p>
          <h1>Drivers</h1>
          <p className="subtitle">
            Add, update, and remove fleet members. Live capacity stays scoped to
            this organisation.
          </p>
        </div>
        <button type="button" className="button primary" onClick={startCreate}>
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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((driver) => (
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
                  <StatusBadge value={driver.presence} />
                </td>
                <td>{driver.zone?.name ?? "Unzoned"}</td>
                <td>
                  {driver.activeLoad} / {driver.maxConcurrentDeliveries}
                </td>
                <td>{driver.telemetryLabel}</td>
                <td>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Edit ${driver.name}`}
                      onClick={() => startEdit(driver)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove ${driver.name}`}
                      onClick={() => startDelete(driver)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="modal-backdrop">
          <div
            className="card modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="driver-dialog-title"
          >
            <div className="card-head" style={{ padding: 0, border: 0 }}>
              <div>
                <h2 id="driver-dialog-title">
                  {open === "create"
                    ? "Add driver"
                    : open === "edit"
                      ? "Update driver"
                      : "Remove driver"}
                </h2>
                <p>
                  {open === "delete"
                    ? "This removes the driver from the organisation fleet."
                    : "Names and zones are stored against this organisation only."}
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => setOpen(null)}
              >
                <X size={16} />
              </button>
            </div>
            {open === "delete" ? (
              <>
                <p>
                  Remove <strong>{selected?.name}</strong> from the fleet?
                  Active assignments and linked logins are blocked.
                </p>
                {error && <p className="form-error">{error}</p>}
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setOpen(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="button danger"
                    onClick={() => void confirmDelete()}
                    disabled={pending}
                  >
                    {pending ? "Removing…" : "Remove driver"}
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={(event) => void submit(event)}>
                <div className="form-field">
                  <label htmlFor="driver-name">Name</label>
                  <input
                    id="driver-name"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    required
                    minLength={2}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="driver-zone">Zone</label>
                  <select
                    id="driver-zone"
                    value={form.zoneId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        zoneId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Unzoned</option>
                    {zones.map((zone) => (
                      <option value={zone.id} key={zone.id}>
                        {zone.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="driver-capacity">Max concurrent jobs</label>
                  <input
                    id="driver-capacity"
                    type="number"
                    min={1}
                    max={20}
                    value={form.maxConcurrentDeliveries}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        maxConcurrentDeliveries: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="driver-status">Availability</label>
                  <select
                    id="driver-status"
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value as DriverForm["status"],
                      }))
                    }
                    disabled={
                      open === "edit" &&
                      selected !== null &&
                      !["AVAILABLE", "OFFLINE", "ON_BREAK"].includes(
                        selected.status,
                      )
                    }
                  >
                    <option value="AVAILABLE">Available</option>
                    <option value="OFFLINE">Offline</option>
                    <option value="ON_BREAK">On break</option>
                  </select>
                </div>
                {error && <p className="form-error">{error}</p>}
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setOpen(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="button primary"
                    disabled={pending}
                  >
                    {pending
                      ? "Saving…"
                      : open === "create"
                        ? "Create driver"
                        : "Save changes"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
