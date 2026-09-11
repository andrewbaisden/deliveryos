import { AppShell } from "@/components/app-shell";
import { SimulationConsole } from "@/components/simulation-console";
import { requirePageMembership } from "@/lib/page-auth";

export default async function SimulationPage() {
  const { organization, database } = await requirePageMembership(["ADMIN"]);
  const activeRun = await database.simulationRun.findFirst({
    where: {
      organizationId: organization.id,
      status: { in: ["RUNNING", "PAUSED"] },
    },
    orderBy: { createdAt: "desc" },
  });
  return (
    <AppShell active="Simulation" trail="Simulation">
      <div className="content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Operational laboratory</p>
            <h1>Simulation</h1>
            <p className="subtitle">
              Run repeatable delivery shifts through the same pipelines as a
              real fleet.
            </p>
          </div>
        </div>
        <section className="card sim-hero">
          <h2>Bring the operation to life.</h2>
          <p>
            Choose a scenario, fleet size, speed, and seed. Simulated drivers
            accept work, follow routes, send validated telemetry, and encounter
            controlled operational events.
          </p>
        </section>
        <SimulationConsole
          organizationId={organization.id}
          initialRun={
            activeRun ? { id: activeRun.id, status: activeRun.status } : null
          }
        />
      </div>
    </AppShell>
  );
}
