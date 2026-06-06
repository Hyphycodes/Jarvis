import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * TEMPORARY diagnostic — surfaces the RAW Google Places response so we can see
 * the exact 400 body that enrichPlace's try/catch swallows, and disambiguate a
 * field-mask error from a key/enablement error by trying a MINIMAL mask too.
 * Gated by a one-time token (local CRON_SECRET is a placeholder, so we can't
 * use that). Delete this whole route after enrichment is confirmed working.
 */
const PROBE_TOKEN = "jv-probe-9f3a2c71b6e84d05";

function authorized(req: Request): boolean {
  const url = new URL(req.url);
  if (url.searchParams.get("t") === PROBE_TOKEN) return true;
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

const BASE = "https://places.googleapis.com/v1";

const FULL_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.priceLevel",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.primaryType",
  "places.types",
  "places.currentOpeningHours.weekdayDescriptions",
  "places.photos.name",
].join(",");

const MINIMAL_MASK = ["places.id", "places.displayName"].join(",");

async function tryMask(key: string, mask: string, q: string) {
  try {
    const res = await fetch(`${BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": mask,
      },
      body: JSON.stringify({ textQuery: q, maxResultCount: 1 }),
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text.slice(0, 1500) };
  } catch (err) {
    return { ok: false, status: 0, body: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const key = process.env.GOOGLE_PLACES_API_KEY ?? "";
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "Alinea, Chicago";

  const meta = {
    keyPresent: !!key,
    keyLen: key.length,
    keyTail: key ? key.slice(-4) : null,
    hasTavily: !!process.env.TAVILY_API_KEY,
    hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
  };

  const minimal = key ? await tryMask(key, MINIMAL_MASK, q) : null;
  const full = key ? await tryMask(key, FULL_MASK, q) : null;

  return NextResponse.json({ meta, minimal, full });
}
