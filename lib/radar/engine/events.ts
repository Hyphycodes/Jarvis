import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { runEventScout } from "@/lib/brain/eventScout";
import { processEventCandidates } from "@/lib/intelligence/eventWorker";
import { ENGINE_SOURCE } from "@/lib/radar/engine/ownership";
import { pillarsForItem } from "@/lib/radar/engine/pillars";

/**
 * Events lane engine — the first non-dining physical lane engine (per
 * radar-lane-engine-replication.md). It does NOT duplicate the event system: it
 * orchestrates the existing parts as the dining engine orchestrates its stages.
 *
 *   scout (runEventScout)         → current_events status=pending      [reused]
 *   verify + render               → current_events verified/surfaced + [reused]
 *     (processEventCandidates)      engine-owned surfaced_items
 *   expire dated items            → past events leave Featured         [engine]
 *   day-of routing                → high-fit day-of events → Today     [engine]
 *   backfill ownership            → existing event rows → engine-owned [engine]
 *
 * The warehouse is current_events; the verifier (eventWorker) and scout are
 * unchanged. Cutover = "events" in ENGINE_OWNED_LANES.
 */

// Keep the future-ready pool healthy without over-scouting (Tavily/LLM cost).
const FUTURE_READY_TARGET = 6;
// Featured events shelf size (rendered from the verified pool).
const FEATURED_TARGET = 7;
// Even when thin, scout at most this often (cron may fire every ~30 min).
const SCOUT_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const VERIFY_LIMIT = 12;
// Day-of routing: only genuinely strong events interrupt Today.
const TODAY_SCORE_FLOOR = 0.6;
// Grace after start before a dated card leaves Featured (event may be ongoing).
const EXPIRE_GRACE_MS = 6 * 60 * 60 * 1000;
// Lifecycle statuses the user owns — the engine never touches these.
const LOCKED_STATUSES = ["saved", "planned", "passed", "completed"];

export type EventsEngineResult = {
  scouted: number;
  verified: number;
  held: number;
  rejected: number;
  expiredEvents: number;
  archivedCards: number;
  rendered: number;
  routedToToday: number;
  backfilled: number;
  errors: string[];
};

export async function runEventsEngine(input: {
  userId: string;
  supabase?: SupabaseClient;
}): Promise<EventsEngineResult> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const result: EventsEngineResult = {
    scouted: 0,
    verified: 0,
    held: 0,
    rejected: 0,
    expiredEvents: 0,
    archivedCards: 0,
    rendered: 0,
    routedToToday: 0,
    backfilled: 0,
    errors: [],
  };

  // 1) Backfill ownership so the cutover never drops an in-flight event card.
  result.backfilled = await backfillEngineOwnership(supabase, input.userId);

  // 2) Expire dated items first (warehouse + board) so we don't re-feature stale.
  const expired = await expireDatedEvents(supabase, input.userId);
  result.expiredEvents = expired.events;
  result.archivedCards = expired.cards;

  // 3) Scout only when the future-ready pool is thin AND we haven't scouted
  //    recently (throttle keeps a frequent cron from hammering Tavily/LLM).
  const futureReady = await countFutureReady(supabase, input.userId);
  if (futureReady < FUTURE_READY_TARGET && (await scoutCooledDown(supabase, input.userId))) {
    try {
      const scout = await runEventScout(input.userId);
      result.scouted = scout.candidates_added;
    } catch (err) {
      result.errors.push(`scout: ${msg(err)}`);
    }
  }

  // 4) Verify pending → verified/surfaced (creates engine-owned surfaced_items).
  try {
    const processed = await processEventCandidates(input.userId, VERIFY_LIMIT);
    result.verified = processed.surfaced;
    result.held = processed.held;
    result.rejected = processed.rejected;
    if (processed.errors.length) result.errors.push(...processed.errors);
  } catch (err) {
    result.errors.push(`verify: ${msg(err)}`);
  }

  // 5) Render the verified pool: surface ready future events that have no live
  //    card yet (the events "bench" → featured shelf). The verifier only acts on
  //    status='pending', so already-verified events would otherwise never surface.
  try {
    result.rendered = await renderVerifiedEvents(supabase, input.userId);
  } catch (err) {
    result.errors.push(`render: ${msg(err)}`);
  }

  // 6) Route day-of high-fit events to Today.
  try {
    result.routedToToday = await routeDayOfToToday(supabase, input.userId);
  } catch (err) {
    result.errors.push(`today: ${msg(err)}`);
  }

  return result;
}

/** Render the verified pool to the engine-owned featured shelf.
 *  - INSERT an engine card for a ready future event with no card.
 *  - ADOPT an existing non-engine shown/discovered card (re-tag engine-owned +
 *    pillar tags) so a good event already on the board (e.g. via the old
 *    materializer) survives cutover instead of being suppressed.
 *  - NEVER touch locked/passed/saved/planned/archived rows (respects user + history). */
async function renderVerifiedEvents(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data: events, error } = await supabase
    .from("current_events")
    .select(
      "id, title, venue_name, starts_at, ends_at, ticket_url, discovered_via, sources_cited, description, verdict, verdict_strength, quality_score, event_type, named_entities, vibe_keywords, library_place_id",
    )
    .eq("user_id", userId)
    .in("status", ["verified", "surfaced"])
    .gt("starts_at", new Date().toISOString())
    .order("quality_score", { ascending: false, nullsFirst: false })
    .limit(FEATURED_TARGET);
  if (error || !events?.length) return 0;

  const ids = (events as EventRow[]).map((e) => e.id);
  const { data: existing } = await supabase
    .from("surfaced_items")
    .select("id, source_id, status, source, payload")
    .eq("user_id", userId)
    .eq("category", "events")
    .in("source_id", ids);
  const cardsByEvent = new Map<string, ExistingCard[]>();
  for (const row of (existing ?? []) as ExistingCard[]) {
    if (!row.source_id) continue;
    const list = cardsByEvent.get(row.source_id) ?? [];
    list.push(row);
    cardsByEvent.set(row.source_id, list);
  }

  let rendered = 0;
  for (const e of events as EventRow[]) {
    // Readiness (the events lane contract): real future time + venue + a source.
    const sourceUrl = firstEventSource(e);
    if (!hasOfficialFutureTime(e.starts_at) || !e.venue_name?.trim() || !sourceUrl) continue;

    const cards = cardsByEvent.get(e.id) ?? [];
    const locked = cards.find((c) => LOCKED_OR_ARCHIVED.has(c.status));
    if (locked) continue; // user owns it / intentionally removed — leave alone

    const live = cards.find((c) => c.status === "shown" || c.status === "discovered");
    if (live) {
      // Already on the board — adopt it as engine-owned if it isn't already.
      const payload = isRecord(live.payload) ? live.payload : {};
      if (payload.source_layer === ENGINE_SOURCE) continue;
      const { error: upErr } = await supabase
        .from("surfaced_items")
        .update({ payload: { ...payload, source_layer: ENGINE_SOURCE, pillar_tags: eventPillars(e) } })
        .eq("id", live.id)
        .eq("user_id", userId);
      if (!upErr) rendered += 1;
      continue;
    }
    if (cards.length > 0) continue; // only archived/other — don't resurrect

    // No card → insert a fresh engine-owned one.
    const whyNow = eventWhyNow(e);
    const { error: insErr } = await supabase.from("surfaced_items").insert({
      user_id: userId,
      destination: "radar",
      source: "event_pulse",
      source_id: e.id,
      title: e.title,
      subtitle: e.venue_name,
      description: e.verdict ?? e.description ?? null,
      location_name: e.venue_name,
      starts_at: e.starts_at,
      ends_at: e.ends_at ?? null,
      url: sourceUrl,
      type: "event",
      category: "events",
      tags: e.vibe_keywords ?? [],
      reasons: [whyNow, e.verdict ?? ""].filter(Boolean),
      score: e.verdict_strength ?? e.quality_score ?? null,
      status: "shown",
      payload: {
        source_layer: ENGINE_SOURCE,
        event_id: e.id,
        event_type: e.event_type,
        named_entities: e.named_entities ?? [],
        venue_name: e.venue_name,
        library_place_id: e.library_place_id,
        verdict_strength: e.verdict_strength,
        why_now: whyNow,
        pillar_tags: eventPillars(e),
        verified_source_url: sourceUrl,
        official_starts_at: e.starts_at,
        event_time_locked: true,
      },
    });
    if (!insErr) rendered += 1;
  }
  return rendered;
}

const LOCKED_OR_ARCHIVED = new Set<string>([...LOCKED_STATUSES, "archived"]);

type ExistingCard = {
  id: string;
  source_id: string | null;
  status: string;
  source: string | null;
  payload: unknown;
};

type EventRow = {
  id: string;
  title: string;
  venue_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  ticket_url: string | null;
  discovered_via: string | null;
  sources_cited: unknown;
  description: string | null;
  verdict: string | null;
  verdict_strength: number | null;
  quality_score: number | null;
  event_type: string | null;
  named_entities: string[] | null;
  vibe_keywords: string[] | null;
  library_place_id: string | null;
};

function eventPillars(e: EventRow): string[] {
  return pillarsForItem({ category: "events", lane: "events", tags: e.vibe_keywords ?? [], title: e.title });
}

/** Source URL like the verifier: ticket → discovered_via → first url in sources_cited. */
function firstEventSource(e: EventRow): string | null {
  if (isHttpUrl(e.ticket_url)) return e.ticket_url;
  if (isHttpUrl(e.discovered_via)) return e.discovered_via;
  return firstUrlDeep(e.sources_cited);
}

function firstUrlDeep(value: unknown): string | null {
  if (isHttpUrl(value)) return value;
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = firstUrlDeep(v);
      if (found) return found;
    }
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const found = firstUrlDeep(v);
      if (found) return found;
    }
  }
  return null;
}

/** A real future instant — rejects midnight-only "dates" (T00:00) that carry no
 *  real time, so dateless culture-ish listings don't masquerade as dated events. */
function hasOfficialFutureTime(v: string | null): boolean {
  if (!v) return false;
  const t = new Date(v).getTime();
  if (!Number.isFinite(t) || t <= Date.now()) return false;
  return !/T00:00(?::00(?:\.000)?)?(?:Z|[+-]\d\d:?\d\d)?$/i.test(v);
}

function eventWhyNow(e: EventRow): string {
  const parts: string[] = [];
  if (e.named_entities?.length) parts.push(e.named_entities.slice(0, 2).join(" + "));
  if (e.starts_at) {
    const d = new Date(e.starts_at);
    if (!Number.isNaN(d.getTime())) {
      parts.push(
        `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })}`,
      );
    }
  }
  return parts.join(" · ") || "Upcoming event.";
}

function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}

/** Tag existing event cards engine-owned so suppressSupersededLanes keeps them
 *  at cutover (rather than dropping un-tagged event_pulse rows). Idempotent. */
async function backfillEngineOwnership(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("surfaced_items")
    .select("id, payload")
    .eq("user_id", userId)
    .eq("category", "events")
    // The verifier's output (event_pulse) is the real events shelf. Leave
    // library_materializer event rows un-tagged so suppressSupersededLanes drops
    // them at cutover — that was the duplicate event system.
    .neq("source", "library_materializer")
    .in("status", ["shown", "discovered", "opened", "saved", "planned"]);
  if (error || !data) return 0;
  let count = 0;
  for (const row of data as Array<{ id: string; payload: unknown }>) {
    const payload = isRecord(row.payload) ? row.payload : {};
    if (payload.source_layer === ENGINE_SOURCE) continue;
    const { error: upErr } = await supabase
      .from("surfaced_items")
      .update({ payload: { ...payload, source_layer: ENGINE_SOURCE } })
      .eq("id", row.id)
      .eq("user_id", userId);
    if (!upErr) count += 1;
  }
  return count;
}

/** Past dated events leave Featured (board) and the warehouse marks them expired.
 *  Locked (saved/planned/passed/completed) cards are never touched. */
async function expireDatedEvents(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ events: number; cards: number }> {
  const cutoff = new Date(Date.now() - EXPIRE_GRACE_MS).toISOString();

  const { data: cardData, error: cardErr } = await supabase
    .from("surfaced_items")
    .update({ status: "archived" })
    .eq("user_id", userId)
    .eq("category", "events")
    .lt("starts_at", cutoff)
    .in("status", ["shown", "discovered", "opened"])
    .select("id");
  const cards = cardErr ? 0 : (cardData?.length ?? 0);

  const { data: evtData, error: evtErr } = await supabase
    .from("current_events")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .lt("starts_at", cutoff)
    .in("status", ["verified", "surfaced", "pending", "needs_enrichment"])
    .select("id");
  const events = evtErr ? 0 : (evtData?.length ?? 0);

  return { events, cards };
}

/** True when no event was discovered within the throttle window — so the engine
 *  can run frequently (expire/today/verify) but only scout periodically. */
async function scoutCooledDown(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("current_events")
    .select("discovered_at")
    .eq("user_id", userId)
    .order("discovered_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const last = (data as { discovered_at: string | null } | null)?.discovered_at;
  if (!last) return true;
  const t = new Date(last).getTime();
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > SCOUT_MIN_INTERVAL_MS;
}

/** Count future, ready-to-feature events in the warehouse. */
async function countFutureReady(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count } = await supabase
    .from("current_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["verified", "surfaced"])
    .gt("starts_at", new Date().toISOString());
  return count ?? 0;
}

/** Day-of high-fit events → Today. Only strong, unscheduled radar events whose
 *  start is on today's local calendar date. Stable: never reverts user choices. */
async function routeDayOfToToday(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("surfaced_items")
    .select("id, starts_at, score")
    .eq("user_id", userId)
    .eq("category", "events")
    .eq("status", "shown")
    .eq("destination", "radar")
    .gte("starts_at", new Date(Date.now() - EXPIRE_GRACE_MS).toISOString());
  if (error || !data) return 0;

  const todayKey = localDateKey(new Date());
  let routed = 0;
  for (const row of data as Array<{ id: string; starts_at: string | null; score: number | null }>) {
    if (!row.starts_at) continue;
    if (localDateKey(new Date(row.starts_at)) !== todayKey) continue;
    if ((row.score ?? 0) < TODAY_SCORE_FLOOR) continue;
    const { error: upErr } = await supabase
      .from("surfaced_items")
      .update({ destination: "today" })
      .eq("id", row.id)
      .eq("user_id", userId)
      .not("status", "in", `(${LOCKED_STATUSES.join(",")})`);
    if (!upErr) routed += 1;
  }
  return routed;
}

function localDateKey(d: Date, tz = "America/Chicago"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
