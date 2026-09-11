"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@deliveryos.local");
  const [password, setPassword] = useState("ChangeMe123!");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      setPending(false);
      setError(result.error.message ?? "Unable to sign in");
      return;
    }
    let home = "/ops";
    try {
      const context = await fetch("/api/v1/me", { cache: "no-store" });
      if (context.ok) {
        const body = (await context.json()) as { data?: { home?: string } };
        if (body.data?.home) home = body.data.home;
      }
    } catch {
      // Fall back to the operations dashboard when membership lookup fails.
    }
    setPending(false);
    router.push(home);
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <p className="eyebrow">Operations access</p>
      <h2>Welcome back</h2>
      <p>Sign in to monitor the East London to Central London operation.</p>
      <div className="form-field">
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
        />
      </div>
      <div className="form-field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
        />
      </div>
      {error && (
        <p style={{ color: "var(--red)", margin: "0 0 10px" }}>{error}</p>
      )}
      <button type="submit" className="button primary" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <div className="demo-hint">
        <strong>Demo workspace</strong>
        <br />
        Run the seed command first. Credentials are populated from your local
        environment and must be changed for deployment.
      </div>
    </form>
  );
}
