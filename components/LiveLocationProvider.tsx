"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { useLiveLocation } from "@/lib/location/useLiveLocation";

// Mounts the live-location watcher for authenticated sessions.
// Resolves userId from the browser auth session so the server layout
// doesn't need to pass it down as a prop.
export function LiveLocationProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => { listener.subscription.unsubscribe(); };
  }, []);

  useLiveLocation(userId);

  return <>{children}</>;
}
