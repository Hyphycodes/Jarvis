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
 * Tiny client-side store for an event's lifecycle status.
 * Persisted to localStorage so the three zoom levels (Today, Plan, Active)
 * stay in sync across navigations.
 */
export function useEventStatus(id: string) {
  // Start in "idle" on the server to keep SSR markup stable, then hydrate
  // from localStorage on mount.
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

  const setPersisted = useCallback(
    (next: EventStatus) => {
      setStatus(next);
      try {
        window.localStorage.setItem(KEY(id), next);
      } catch {
        // ignore
      }
    },
    [id],
  );

  const begin = useCallback(() => setPersisted("live"), [setPersisted]);
  const reset = useCallback(() => setPersisted("idle"), [setPersisted]);

  return { status, hydrated, begin, reset, set: setPersisted };
}
