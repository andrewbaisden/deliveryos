"use client";

import {
  allowedCommands,
  type DeliveryCommand,
  type DeliveryState,
} from "@deliveryos/domain";
import { Check, Navigation, PackageCheck, Power, Truck } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "./status-badge";

const labels: Partial<Record<DeliveryCommand, string>> = {
  ACCEPT: "Accept delivery",
  START_PICKUP_ROUTE: "Navigate to pickup",
  ARRIVE_PICKUP: "Confirm arrival",
  CONFIRM_PICKUP: "Confirm pickup",
  DEPART_PICKUP: "Start delivery",
  ARRIVE_DROPOFF: "Arrived at customer",
  COMPLETE: "Complete delivery",
};
const commandSlugs: Partial<Record<DeliveryCommand, string>> = {
  ACCEPT: "accept",
  START_PICKUP_ROUTE: "start-pickup",
  ARRIVE_PICKUP: "arrive-pickup",
  CONFIRM_PICKUP: "confirm-pickup",
  DEPART_PICKUP: "depart-pickup",
  ARRIVE_DROPOFF: "arrive-dropoff",
  COMPLETE: "complete",
};

type DeliveryProjection = {
  id: string;
  reference: string;
  status: DeliveryState["status"];
  version: number;
  pickup: string;
  dropoff: string;
  actualPickupAt: string | null;
  actualDeliveryAt: string | null;
};

export function DriverWorkflow({
  organizationId,
  driver,
  delivery: initialDelivery,
}: {
  organizationId: string;
  driver: { id: string; name: string; status: string };
  delivery: DeliveryProjection | null;
}) {
  const [delivery, setDelivery] = useState(initialDelivery);
  const [online, setOnline] = useState(driver.status !== "OFFLINE");
  const [recipientName, setRecipientName] = useState("");
  const [proofNote, setProofNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commands = delivery
    ? allowedCommands(delivery.status).filter(
        (command) => command in commandSlugs,
      )
    : [];

  async function advance(command: DeliveryCommand) {
    if (!delivery || !commandSlugs[command]) return;
    if (command === "COMPLETE" && !recipientName.trim()) {
      setError("Enter the recipient name to complete this delivery.");
      return;
    }
    setPending(true);
    setError(null);
    const response = await fetch(
      `/api/v1/organizations/${organizationId}/deliveries/${delivery.id}/commands/${commandSlugs[command]}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(
          command === "COMPLETE"
            ? {
                recipientName: recipientName.trim(),
                note: proofNote.trim() || undefined,
              }
            : {},
        ),
      },
    );
    const body = await response.json();
    if (!response.ok) {
      setError(body.error?.message ?? "The command could not be completed.");
      setPending(false);
      return;
    }
    setDelivery((current) =>
      current
        ? {
            ...current,
            status: body.data.status,
            version: body.data.version,
            actualPickupAt: body.data.actualPickupAt,
            actualDeliveryAt: body.data.actualDeliveryAt,
          }
        : null,
    );
    setPending(false);
  }

  async function togglePresence() {
    setPending(true);
    setError(null);
    const nextOnline = !online;
    const response = await fetch(
      `/api/v1/organizations/${organizationId}/drivers/me/status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ status: nextOnline ? "AVAILABLE" : "OFFLINE" }),
      },
    );
    const body = await response.json();
    if (response.ok) setOnline(nextOnline);
    else setError(body.error?.message ?? "Driver status could not be updated.");
    setPending(false);
  }

  return (
    <div className="tracking-shell">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 18,
        }}
      >
        <div>
          <p className="eyebrow">Driver</p>
          <h1 style={{ fontSize: 23 }}>Hello, {driver.name.split(" ")[0]}.</h1>
        </div>
        <button
          type="button"
          className={`button ${online ? "danger" : "primary"}`}
          onClick={togglePresence}
          disabled={pending || Boolean(delivery)}
          title={
            delivery ? "Finish active work before going offline" : undefined
          }
        >
          <Power size={14} />
          {online ? "Go offline" : "Go online"}
        </button>
      </div>
      <article className="tracking-card">
        <div className="tracking-top">
          {!delivery ? (
            <div className="tracking-eta">
              <Check size={22} color="var(--green)" />
              <strong style={{ fontSize: 16 }}>No active assignment</strong>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <span className="label">Current assignment</span>
                  <h2 style={{ margin: 0 }}>Delivery #{delivery.reference}</h2>
                </div>
                <StatusBadge value={delivery.status} />
              </div>
              <div
                style={{
                  marginTop: 22,
                  display: "grid",
                  gridTemplateColumns: "1fr auto 1fr",
                  gap: 13,
                  alignItems: "center",
                }}
              >
                <div>
                  <span className="label">Pickup</span>
                  <strong style={{ fontSize: 12 }}>{delivery.pickup}</strong>
                </div>
                <Navigation size={16} color="var(--green)" />
                <div>
                  <span className="label">Drop-off</span>
                  <strong style={{ fontSize: 12 }}>{delivery.dropoff}</strong>
                </div>
              </div>
              <div style={{ marginTop: 26 }}>
                {delivery.status === "ARRIVED_DROPOFF" && (
                  <div className="control-group" style={{ marginBottom: 14 }}>
                    <label htmlFor="recipient-name">Recipient name</label>
                    <input
                      id="recipient-name"
                      value={recipientName}
                      onChange={(event) => setRecipientName(event.target.value)}
                    />
                    <label htmlFor="proof-note">Delivery note</label>
                    <input
                      id="proof-note"
                      value={proofNote}
                      onChange={(event) => setProofNote(event.target.value)}
                    />
                  </div>
                )}
                {commands.map((command) => (
                  <button
                    type="button"
                    key={command}
                    className="button primary"
                    style={{ width: "100%", height: 46 }}
                    onClick={() => advance(command)}
                    disabled={pending}
                  >
                    {command.includes("PICKUP") ? <PackageCheck /> : <Truck />}
                    {pending ? "Working…" : labels[command]}
                  </button>
                ))}
              </div>
            </>
          )}
          {error && (
            <p style={{ color: "var(--red)", marginTop: 12 }}>{error}</p>
          )}
        </div>
      </article>
    </div>
  );
}
