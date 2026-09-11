"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignOutControl({
  name,
  membershipRole,
  variant = "sidebar",
}: {
  name: string;
  membershipRole: string;
  variant?: "sidebar" | "inline";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  const action = (
    <button
      type="button"
      className={variant === "inline" ? "button secondary" : "profile-logout"}
      onClick={() => void signOut()}
      disabled={pending}
    >
      <LogOut size={13} />
      {pending ? "Leaving…" : "Log out"}
    </button>
  );

  if (variant === "inline") return action;

  return (
    <div className="profile">
      <span className="avatar">{initials}</span>
      <div>
        <strong>{name}</strong>
        <span>{membershipRole.toLowerCase()}</span>
      </div>
      {action}
    </div>
  );
}
