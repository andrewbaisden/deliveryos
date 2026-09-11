import type { MembershipRole } from "@deliveryos/database";
import { database } from "@deliveryos/database/client";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "./auth";

export async function requirePageMembership(roles?: MembershipRole[]) {
  if (!database) redirect("/sign-in?reason=database");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const membership = await database.membership.findFirst({
    where: {
      userId: session.user.id,
      ...(roles ? { role: { in: roles } } : {}),
    },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) notFound();
  return {
    database,
    session,
    membership,
    organization: membership.organization,
  };
}
