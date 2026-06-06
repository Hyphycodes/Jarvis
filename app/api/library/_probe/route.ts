import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * TEMPORARY diagnostic — surfaces the RAW Google Places response so we can see
 * the exact 400 body that enrichPlace's try/catch swallows. CRON_SECRET gated.
 * Delete after enrichment is confirmed working.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

const BASE = "https://places.googleapis.com/v1";

const ENRICHMENT_FIELDS = [
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
    fieldMask: ENRICHMENT_FIELDS,
  };

  try {
    const res = await fetch(`${BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": ENRICHMENT_FIELDS,
      },
      body: JSON.stringify({ textQuery: q, maxResultCount: 1 }),
    });
    const text = await res.text();
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      meta,
      body: text.slice(0, 2000),
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      meta,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
