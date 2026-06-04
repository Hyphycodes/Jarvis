import "server-only";

import webpush from "web-push";

export type PushSubscriptionKeys = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

/**
 * True only when all three VAPID env vars are present. Callers probe this
 * before doing any push work so an unconfigured environment is a silent no-op.
 */
export function hasVapid(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_EMAIL,
  );
}

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (!hasVapid()) return false;
  if (!vapidConfigured) {
    const email = process.env.VAPID_EMAIL!;
    webpush.setVapidDetails(
      email.startsWith("mailto:") || email.startsWith("https:")
        ? email
        : `mailto:${email}`,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    vapidConfigured = true;
  }
  return true;
}

/**
 * Send a single web-push notification. Never throws — a missing VAPID config
 * or a failed delivery is logged and swallowed so a cron run is never broken
 * by an unreachable or expired subscription.
 */
export async function sendPushNotification(
  subscription: PushSubscriptionKeys,
  payload: PushPayload,
): Promise<void> {
  if (!ensureVapidConfigured()) {
    console.warn("[push] VAPID not configured; skipping push send");
    return;
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
    );
  } catch (err) {
    console.error("[push] sendNotification failed", {
      endpoint: subscription.endpoint.slice(0, 48),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
