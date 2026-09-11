"use client";

import { useEffect, useState } from "react";

export function useLiveResource<T>(url: string, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function refresh() {
      const response = await fetch(url, { cache: "no-store" });
      const body = (await response.json()) as {
        data?: T;
        error?: { message?: string };
      };
      if (!active) return;
      if (response.ok && body.data !== undefined) {
        setData(body.data);
        setError(null);
        return;
      }
      setError(body.error?.message ?? "Live data is unavailable");
    }
    void refresh();
    const timer = setInterval(() => void refresh(), intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [intervalMs, url]);

  return { data, error };
}
