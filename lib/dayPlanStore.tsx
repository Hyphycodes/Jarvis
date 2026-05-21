"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "jarvis.dayPlan.activeItemId";

type DayPlanState = {
  /** ID of the active timeline/plan item, or null when nothing is active. */
  activeItemId: string | null;
  setActive: (id: string) => void;
  clear: () => void;
  /** Toggle: if `id` is currently active, clear; otherwise make `id` active. */
  toggle: (id: string) => void;
};

const DayPlanContext = createContext<DayPlanState | null>(null);

function readInitial(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function DayPlanProvider({ children }: { children: ReactNode }) {
  // Start null on both server and client to keep hydration clean.
  // We hydrate from localStorage on mount so the first paint matches SSR.
  const [activeItemId, setState] = useState<string | null>(null);

  useEffect(() => {
    const initial = readInitial();
    if (initial) setState(initial);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (activeItemId) {
        window.localStorage.setItem(STORAGE_KEY, activeItemId);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore quota / privacy mode errors
    }
  }, [activeItemId]);

  const setActive = useCallback((id: string) => {
    setState(id);
  }, []);

  const clear = useCallback(() => {
    setState(null);
  }, []);

  const toggle = useCallback((id: string) => {
    setState((prev) => (prev === id ? null : id));
  }, []);

  return (
    <DayPlanContext.Provider
      value={{ activeItemId, setActive, clear, toggle }}
    >
      {children}
    </DayPlanContext.Provider>
  );
}

export function useDayPlan(): DayPlanState {
  const ctx = useContext(DayPlanContext);
  if (!ctx) {
    throw new Error("useDayPlan must be used inside <DayPlanProvider>");
  }
  return ctx;
}

/**
 * Safe variant that returns a no-op default when used outside the provider.
 * Useful for server-rendered surfaces that need to read state without
 * forcing the entire tree under the provider.
 */
export function useDayPlanSafe(): DayPlanState {
  const ctx = useContext(DayPlanContext);
  if (ctx) return ctx;
  return {
    activeItemId: null,
    setActive: () => undefined,
    clear: () => undefined,
    toggle: () => undefined,
  };
}
