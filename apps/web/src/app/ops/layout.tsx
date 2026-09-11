import type { ReactNode } from "react";
import { requirePageMembership } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function OperationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePageMembership(["ADMIN", "DISPATCHER"]);
  return children;
}
