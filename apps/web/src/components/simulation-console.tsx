"use client";

import {
  Activity,
  Clock3,
  CloudRain,
  Pause,
  Play,
  RotateCcw,
  Square,
  Sun,
} from "lucide-react";
import { useState } from "react";

const scenarios = [
  ["NORMAL_SHIFT", "Normal shift", "Steady demand · normal traffic", Sun],
  ["PEAK_PERIOD", "Peak period", "High demand · traffic pressure", Activity],
  [
    "DISRUPTION",
    "Disruption",
    "Delay · offline driver · failed job",
    CloudRain,
  ],
  ["LATE_SHIFT", "Late shift", "Deliveries nearing their SLA", Clock3],
] as const;
type Scenario = (typeof scenarios)[number][0];
type Run = { id: string; status: string };

export function SimulationConsole({
  organizationId,
  initialRun,
}: {
  organizationId: string;
  initialRun: Run | null;
}) {
  const [scenario, setScenario] = useState<Scenario>("NORMAL_SHIFT");
  const [fleetSize, setFleetSize] = useState<5 | 25 | 100>(25);
  const [speed, setSpeed] = useState<1 | 2 | 5 | 10>(5);
  const [seed, setSeed] = useState(812764);
  const [run, setRun] = useState(initialRun);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    const response = await fetch(
      `/api/v1/organizations/${organizationId}/simulations/start`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ scenario, driverCount: fleetSize, speed, seed }),
      },
    );
    const body = await response.json();
    if (response.ok) setRun({ id: body.data.id, status: body.data.status });
    else setError(body.error?.message ?? "The simulation could not start.");
    setPending(false);
  }

  async function command(action: "pause" | "resume" | "stop" | "reset") {
    if (!run) return;
    setPending(true);
    setError(null);
    const response = await fetch(
      `/api/v1/organizations/${organizationId}/simulations/${run.id}/${action}`,
      {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      },
    );
    const body = await response.json();
    if (response.ok) {
      if (action === "reset") setRun(null);
      else setRun({ ...run, status: body.data.status });
    } else
      setError(body.error?.message ?? `The simulation could not ${action}.`);
    setPending(false);
  }

  return (
    <>
      <div className="scenario-grid">
        {scenarios.map(([id, title, description, Icon]) => (
          <button
            type="button"
            className={`scenario ${scenario === id ? "selected" : ""}`}
            onClick={() => setScenario(id)}
            key={id}
            disabled={Boolean(run)}
          >
            <span className="scenario-icon">
              <Icon size={16} />
            </span>
            <h3>{title}</h3>
            <p>{description}</p>
          </button>
        ))}
      </div>
      <div className="card">
        <div className="control-grid">
          <div className="control-group">
            <label htmlFor="fleet-size">Fleet size</label>
            <select
              id="fleet-size"
              value={fleetSize}
              disabled={Boolean(run)}
              onChange={(event) =>
                setFleetSize(Number(event.target.value) as 5 | 25 | 100)
              }
            >
              <option value="5">5 drivers</option>
              <option value="25">25 drivers</option>
              <option value="100">100 drivers</option>
            </select>
          </div>
          <div className="control-group">
            <label htmlFor="speed">Simulation speed</label>
            <select
              id="speed"
              value={speed}
              disabled={Boolean(run)}
              onChange={(event) =>
                setSpeed(Number(event.target.value) as 1 | 2 | 5 | 10)
              }
            >
              <option value="1">1× real time</option>
              <option value="2">2× speed</option>
              <option value="5">5× speed</option>
              <option value="10">10× speed</option>
            </select>
          </div>
          <div className="control-group">
            <label htmlFor="seed">Seed</label>
            <input
              id="seed"
              value={seed}
              disabled={Boolean(run)}
              inputMode="numeric"
              onChange={(event) =>
                setSeed(Math.max(0, Number(event.target.value)))
              }
            />
          </div>
          {!run ? (
            <button
              type="button"
              className="button primary"
              disabled={pending}
              onClick={start}
            >
              <Play />
              {pending ? "Starting…" : "Start demo"}
            </button>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className="button secondary"
                disabled={pending}
                onClick={() =>
                  command(run.status === "PAUSED" ? "resume" : "pause")
                }
              >
                {run.status === "PAUSED" ? <Play /> : <Pause />}
                {run.status === "PAUSED" ? "Resume" : "Pause"}
              </button>
              <button
                type="button"
                className="button danger"
                disabled={pending || run.status === "STOPPED"}
                onClick={() => command("stop")}
              >
                <Square />
                Stop
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={pending}
                onClick={() => command("reset")}
              >
                <RotateCcw />
                Reset
              </button>
            </div>
          )}
        </div>
        {run && (
          <div
            style={{
              padding: "0 18px 18px",
              color: "var(--green)",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            <i className="health-dot" /> Simulation {run.status.toLowerCase()} ·
            run {run.id.slice(0, 8)}
          </div>
        )}
        {error && (
          <p style={{ padding: "0 18px 18px", color: "var(--red)" }}>{error}</p>
        )}
      </div>
    </>
  );
}
