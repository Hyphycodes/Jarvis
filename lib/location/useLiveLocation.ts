"use client";

import { useEffect, useRef } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const LOCATION_DENIED_KEY = "jarvis_location_denied";

// Accept cached positions up to 30 s old; timeout a stale fix after 10 s.
// enableHighAccuracy: true gives GPS-quality fixes on mobile when available.
const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 30_000,
  timeout: 10_000,
};

export function useLiveLocation(userId: string | null) {
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!userId || typeof navigator === "undefined" || !navigator.geolocation) return;

    // Respect a prior denial — never re-prompt after the user said no.
    try {
      if (localStorage.getItem(LOCATION_DENIED_KEY) === "1") return;
    } catch { /* noop */ }

    const stopWatch = () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };

    const onPosition = (position: GeolocationPosition) => {
      const { coords, timestamp } = position;
      // Guard: skip fixes without all required fields (shouldn't happen, but be safe).
      if (coords.latitude == null || coords.longitude == null || coords.accuracy == null) return;
      void writeLocation(userId, coords.latitude, coords.longitude, coords.accuracy, timestamp);
    };

    const onError = (error: GeolocationPositionError) => {
      if (error.code === error.PERMISSION_DENIED) {
        try { localStorage.setItem(LOCATION_DENIED_KEY, "1"); } catch { /* noop */ }
        stopWatch();
      }
      // TIMEOUT / POSITION_UNAVAILABLE: transient — keep watching.
    };

    async function startWatch() {
      // Check permission state before starting the watch.
      // iOS Safari may not support permissions.query for geolocation — guard for it.
      let permState: PermissionState = "prompt";
      try {
        const result = await navigator.permissions.query({ name: "geolocation" });
        permState = result.state;
      } catch { /* iOS Safari: treat as prompt, let watchPosition decide */ }

      if (permState === "denied") {
        try { localStorage.setItem(LOCATION_DENIED_KEY, "1"); } catch { /* noop */ }
        return;
      }

      // watchPosition is the single active watch — only start one.
      if (watchIdRef.current === null) {
        watchIdRef.current = navigator.geolocation.watchPosition(onPosition, onError, WATCH_OPTIONS);
      }
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // App backgrounded — stop the watch to respect battery / OS limits.
        stopWatch();
      } else {
        // App foregrounded — restart the watch.
        void startWatch();
      }
    };

    void startWatch();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopWatch();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userId]);
}

async function writeLocation(
  userId: string,
  latitude: number,
  longitude: number,
  accuracy_m: number,
  timestampMs: number,
) {
  const supabase = getBrowserSupabase();
  await supabase.from("live_location").upsert(
    {
      user_id: userId,
      latitude,
      longitude,
      accuracy_m,
      captured_at: new Date(timestampMs).toISOString(),
    },
    { onConflict: "user_id" },
  );
}
