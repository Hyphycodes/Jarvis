/**
 * Resolve the canonical site origin (https://host[:port], no trailing slash).
 *
 * Precedence:
 *   1. NEXT_PUBLIC_SITE_URL — explicit, used in production and the
 *      preferred answer everywhere.
 *   2. VERCEL_URL — Vercel sets this for prod + preview deployments. We add
 *      the https:// scheme since Vercel strips it.
 *   3. http://localhost:3000 — local dev fallback.
 */
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured && /^https?:\/\//.test(configured)) {
    return configured.replace(/\/$/, "");
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const cleaned = vercel.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${cleaned}`;
  }
  return "http://localhost:3000";
}

export function authCallbackUrl(): string {
  return `${siteOrigin()}/auth/callback`;
}
