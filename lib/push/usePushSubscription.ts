"use client";

import { useCallback, useEffect, useState } from "react";

export type UsePushSubscription = {
  isSupported: boolean;
  isSubscribed: boolean;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<void>;
};

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function usePushSubscription(): UsePushSubscription {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    const supported =
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator &&
      typeof window !== "undefined" &&
      "PushManager" in window;
    setIsSupported(supported);
    if (!supported) return;

    let cancelled = false;
    (async () => {
      try {
        const registration = await ensureRegistration();
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setIsSubscribed(Boolean(existing));
      } catch (err) {
        console.error("[push] init failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported) return false;
    if (!VAPID_PUBLIC_KEY) {
      console.warn("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY missing; cannot subscribe");
      return false;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return false;

      const registration = await ensureRegistration();
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(VAPID_PUBLIC_KEY),
        });
      }

      const p256dh = subscription.getKey("p256dh");
      const auth = subscription.getKey("auth");
      if (!p256dh || !auth) return false;

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: arrayBufferToBase64(p256dh),
          auth: arrayBufferToBase64(auth),
        }),
      });
      if (res.ok) {
        setIsSubscribed(true);
        return true;
      }
    } catch (err) {
      console.error("[push] subscribe failed", err);
    }
    return false;
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;
    try {
      const registration = await ensureRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setIsSubscribed(false);
        return;
      }
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      setIsSubscribed(false);
    } catch (err) {
      console.error("[push] unsubscribe failed", err);
    }
  }, [isSupported]);

  return { isSupported, isSubscribed, subscribe, unsubscribe };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js");
}

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    view[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
