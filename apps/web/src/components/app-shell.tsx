import {
  BarChart3,
  Bell,
  Box,
  Clock3,
  LayoutDashboard,
  Map as MapIcon,
  Play,
  Search,
  Settings,
  Truck,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutControl } from "@/components/sign-out-control";
import { requirePageMembership } from "@/lib/page-auth";
import { ensureRedis } from "@/lib/redis";

const nav = [
  ["Overview", "/ops", LayoutDashboard],
  ["Deliveries", "/ops/deliveries", Box],
  ["Drivers", "/ops/drivers", Users],
  ["Live map", "/ops", MapIcon],
  ["Simulation", "/ops/simulation", Play],
  ["History", "/ops/history", Clock3],
  ["Analytics", "/ops/analytics", BarChart3],
] as const;

export async function AppShell({
  children,
  active = "Overview",
  trail = "Live operations",
}: {
  children: ReactNode;
  active?: string;
  trail?: string;
}) {
  const { session, membership, organization } = await requirePageMembership([
    "ADMIN",
    "DISPATCHER",
  ]);
  let workerLive = false;
  try {
    const heartbeat = await (await ensureRedis()).get(
      "deliveryos:worker:heartbeat",
    );
    workerLive = Boolean(
      heartbeat && Date.now() - new Date(heartbeat).getTime() <= 45_000,
    );
  } catch {
    workerLive = false;
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" href="/ops">
          <span className="brand-mark">
            <Truck size={18} />
          </span>
          DeliveryOS
        </Link>
        <div className="nav-label">Operations</div>
        <nav className="nav" aria-label="Primary navigation">
          {nav.map(([label, href, Icon]) => (
            <Link
              className={label === active ? "active" : ""}
              href={href}
              key={label}
            >
              <Icon />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="system-card">
            <div className="system-line">
              <span>
                <i className="health-dot" />
                Systems
              </span>
              <strong>{workerLive ? "Healthy" : "Degraded"}</strong>
            </div>
            <div className="system-line" style={{ marginTop: 10 }}>
              <span>Worker</span>
              <strong>{workerLive ? "Live" : "No heartbeat"}</strong>
            </div>
          </div>
          <SignOutControl
            name={session.user.name}
            membershipRole={membership.role}
          />
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="crumb">
            {organization.name} &nbsp;/&nbsp; <strong>{trail}</strong>
          </div>
          <div className="top-actions">
            <span className="live-chip">
              <i /> LIVE
            </span>
            <button type="button" className="icon-button" aria-label="Search">
              <Search size={15} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Notifications"
            >
              <Bell size={15} />
            </button>
            <button type="button" className="icon-button" aria-label="Settings">
              <Settings size={15} />
            </button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
