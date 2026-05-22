"use client";

import { useCallback, useEffect, useState } from "react";

export type EventStatus = "idle" | "live";

const KEY = (id: string) => `jarvis.event.${id}.status`;

function read(id: string): EventStatus {
  if (typeof window === "undefined") return "idle";
  try {
    const v = window.localStorage.getItem(KEY(id));
    return v === "live" ? "live" : "idle";
  } catch {
    return "idle";
  }
}

/**
 * Thin client-side mirror of plan.live_enabled. localStorage is *only* used as
 * an optimistic cache; the Supabase column is the source of truth. Pass a
 * UUID `planId` to also write through to the server.
 */
export function useEventStatus(id: string, options: { planId?: string } = {}) {
  const [status, setStatus] = useState<EventStatus>("idle");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setStatus(read(id));
    setHydrated(true);
    function onStorage(e: StorageEvent) {
      if (e.key === KEY(id)) setStatus(read(id));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [id]);

  const writeServer = useCallback(
    async (next: EventStatus) => {
      if (!options.planId) return;
      try {
        await fetch(`/api/plans/${options.planId}/live`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: next === "live" }),
        });
      } catch (err) {
        console.error("plan live write failed", err);
      }
    },
    [options.planId],
  );

  const setPersisted = useCallback(
    (next: EventStatus) => {
      setStatus(next);
      try {
        window.localStorage.setItem(KEY(id), next);
      } catch {
        // ignore
      }
      void writeServer(next);
    },
    [id, writeServer],
  );

  const begin = useCallback(() => setPersisted("live"), [setPersisted]);
  const reset = useCallback(() => setPersisted("idle"), [setPersisted]);

  return { status, hydrated, begin, reset, set: setPersisted };
}
