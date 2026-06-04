"use client";

import { useEffect } from "react";

/**
 * Registers the push/notification service worker once on app load.
 * Idempotent — re-registering the same URL returns the existing registration.
 * Rendered from the root layout so the worker is active app-wide.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[push] service worker registration failed", err);
    });
  }, []);

  return null;
}
