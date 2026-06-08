import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { runEventScout } from "@/lib/brain/eventScout";
import { processEventCandidates } from "@/lib/intelligence/eventWorker";
import { ENGINE_SOURCE } from "@/lib/radar/engine/ownership";
import { pillarsForItem } from "@/lib/radar/engine/pillars";
import { scoutAllEventSubLibraries } from "@/lib/radar/engine/events/scout";
import { runEventsCouncil } from "@/lib/radar/engine/events/council";
import { selectEventsShelf, type ShelfCandidate } from "@/lib/radar/engine/events/editor";
import {
  assessTruth,
  assessFit,
  assessUrgency,
  assessPlanability,
  expiresAtFor,
  type AssessableEvent,
} from "@/lib/radar/engine/events/assess";
import { classifyEventSubLibrary } from "@/lib/radar/engine/events/config";
import { readOperatingPreferences } from "@/lib/operating/readOperatingPreferences";
import type { Json } from "@/lib/types/database";

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
  scoutedStructured: number;
  verified: number;
  held: number;
  rejected: number;
  assessed: number;
  judged: number;
  expiredEvents: number;
  archivedCards: number;
  rendered: number;
  demoted: number;
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
    scoutedStructured: 0,
    verified: 0,
    held: 0,
    rejected: 0,
    assessed: 0,
    judged: 0,
    expiredEvents: 0,
    archivedCards: 0,
    rendered: 0,
    demoted: 0,
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

  // 3) Scout when the future-ready pool is thin AND cooled down. SerpAPI Events
  //    (structured, no LLM) is the reliable layer; Tavily+Claude is complementary.
  const futureReady = await countFutureReady(supabase, input.userId);
  if (futureReady < FUTURE_READY_TARGET && (await scoutCooledDown(supabase, input.userId))) {
    try {
      const structured = await scoutAllEventSubLibraries({ userId: input.userId, supabase });
      result.scoutedStructured = structured.reduce((s, r) => s + r.added, 0);
    } catch (err) {
      result.errors.push(`scout(serp): ${msg(err)}`);
    }
    try {
      const scout = await runEventScout(input.userId);
      result.scouted = scout.candidates_added;
    } catch (err) {
      result.errors.push(`scout(tavily): ${msg(err)}`);
    }
  }

  // 4) Verify pending → verified/surfaced.
  try {
    const processed = await processEventCandidates(input.userId, VERIFY_LIMIT);
    result.verified = processed.surfaced;
    result.held = processed.held;
    result.rejected = processed.rejected;
    if (processed.errors.length) result.errors.push(...processed.errors);
  } catch (err) {
    result.errors.push(`verify: ${msg(err)}`);
  }

  // 5) Assess (deterministic Truth/Fit/Urgency/Planability + expires_at + pre_score)
  //    on every verified future event — the cheap brain layer before the LLM council.
  try {
    result.assessed = await assessVerifiedEvents(supabase, input.userId);
  } catch (err) {
    result.errors.push(`assess: ${msg(err)}`);
  }

  // 6) Events Specialist Council (LLM) on finalists → final_score + taste vector.
  try {
    const council = await runEventsCouncil({ userId: input.userId, supabase });
    result.judged = council.reduce((s, r) => s + r.judged, 0);
    result.rejected += council.reduce((s, r) => s + r.rejected, 0);
    for (const r of council) if (r.errors.length) result.errors.push(...r.errors);
  } catch (err) {
    result.errors.push(`council: ${msg(err)}`);
  }

  // 7) Comparative (deterministic head-to-head rank per sub-library).
  try {
    await rankComparative(supabase, input.userId);
  } catch (err) {
    result.errors.push(`comparative: ${msg(err)}`);
  }

  // 8) Editor + render: assemble the balanced shelf (final_score + urgency, sub-library
  //    + venue variety) and surface exactly that set as engine-owned cards.
  try {
    const shelf = await renderEventsShelf(supabase, input.userId);
    result.rendered = shelf.rendered;
    result.demoted = shelf.demoted;
  } catch (err) {
    result.errors.push(`render: ${msg(err)}`);
  }

  // 9) Route day-of high-fit events to Today.
  try {
    result.routedToToday = await routeDayOfToToday(supabase, input.userId);
  } catch (err) {
    result.errors.push(`today: ${msg(err)}`);
  }

  return result;
}

/** Deterministic brain layer: write Truth/Fit/Urgency/Planability + expires_at +
 *  pre_score onto verified future events (cheap, every cycle, no LLM). */
async function assessVerifiedEvents(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("current_events")
    .select(
      "id, title, sub_library, event_type, venue_name, description, vibe_keywords, starts_at, ends_at, ticket_url, discovered_via, sources_cited, named_entities, verdict_strength, price_min, price_max",
    )
    .eq("user_id", userId)
    .in("status", ["verified", "surfaced"])
    .gt("starts_at", new Date().toISOString())
    .limit(40);
  if (error || !data) return 0;

  const prefs = await readOperatingPreferences(supabase, userId).catch(() => null);
  const now = new Date();
  let assessed = 0;
  for (const row of data as AssessRow[]) {
    const e: AssessableEvent = {
      title: row.title,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      venue_name: row.venue_name,
      ticket_url: row.ticket_url,
      discovered_via: row.discovered_via,
      sources_cited: row.sources_cited,
      named_entities: row.named_entities,
      verdict_strength: row.verdict_strength,
      price_min: row.price_min,
      price_max: row.price_max,
      sub_library: row.sub_library,
    };
    const truth = assessTruth(e);
    const urgency = assessUrgency(e, now);
    const fit = assessFit(e, {
      now,
      lowFrictionWeeknights: prefs?.lowFrictionWeeknights,
      premiumThreshold: prefs?.premiumThreshold ?? null,
    });
    const planability = assessPlanability(e);
    const subLibrary = row.sub_library ?? classifyEventSubLibrary({
      event_type: row.event_type,
      title: row.title,
      description: row.description,
      venue_name: row.venue_name,
      vibe_keywords: row.vibe_keywords,
    });
    const pre_score = clamp01(0.5 * truth.exists_confidence + 0.5 * fit.fit_score);
    const { error: upErr } = await supabase
      .from("current_events")
      .update({
        sub_library: subLibrary,
        truth_assessment: truth as unknown as Json,
        fit_assessment: fit as unknown as Json,
        urgency_assessment: urgency as unknown as Json,
        planability_assessment: planability as unknown as Json,
        pre_score,
        expires_at: expiresAtFor(e),
        updated_at: now.toISOString(),
      })
      .eq("id", row.id)
      .eq("user_id", userId);
    if (!upErr) assessed += 1;
  }
  return assessed;
}

type AssessRow = {
  id: string;
  title: string;
  sub_library: string | null;
  event_type: string | null;
  venue_name: string | null;
  description: string | null;
  vibe_keywords: string[] | null;
  starts_at: string | null;
  ends_at: string | null;
  ticket_url: string | null;
  discovered_via: string | null;
  sources_cited: unknown;
  named_entities: string[] | null;
  verdict_strength: number | null;
  price_min: number | null;
  price_max: number | null;
};

/** Deterministic comparative: rank judged future events within each sub-library by
 *  final_score (tiebreak urgency) → comparative_rank. */
async function rankComparative(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data } = await supabase
    .from("current_events")
    .select("id, sub_library, final_score, urgency_assessment")
    .eq("user_id", userId)
    .in("status", ["verified", "surfaced"])
    .gt("starts_at", new Date().toISOString())
    .not("final_score", "is", null);
  const rows = (data ?? []) as Array<{ id: string; sub_library: string | null; final_score: number | null; urgency_assessment: unknown }>;
  const bySub = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.sub_library ?? "unknown";
    const list = bySub.get(k) ?? [];
    list.push(r);
    bySub.set(k, list);
  }
  for (const list of bySub.values()) {
    list.sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0) + (urgencyWeight(b.urgency_assessment) - urgencyWeight(a.urgency_assessment)));
    for (let i = 0; i < list.length; i++) {
      await supabase
        .from("current_events")
        .update({ comparative_rank: i + 1 })
        .eq("id", list[i].id)
        .eq("user_id", userId);
    }
  }
}

function urgencyWeight(a: unknown): number {
  const u = isRecord(a) && typeof a.urgency === "string" ? a.urgency : "normal";
  return u === "now" ? 0.15 : u === "soon" ? 0.1 : u === "normal" ? 0.04 : 0;
}

/** Editor + render: assemble the balanced shelf (selectEventsShelf over JUDGED
 *  events) and surface exactly that set as engine-owned cards. Featured events get
 *  a shown/radar engine card (insert or adopt); engine event cards that fall off
 *  the shelf are demoted to 'discovered' (off-board, re-featurable). Locked/passed/
 *  archived rows are never touched. */
async function renderEventsShelf(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ rendered: number; demoted: number }> {
  const { data: events, error } = await supabase
    .from("current_events")
    .select(
      "id, title, venue_name, starts_at, ends_at, ticket_url, discovered_via, sources_cited, description, verdict, verdict_strength, quality_score, final_score, sub_library, urgency_assessment, event_type, named_entities, vibe_keywords, library_place_id",
    )
    .eq("user_id", userId)
    .in("status", ["verified", "surfaced"])
    .gt("starts_at", new Date().toISOString())
    .not("final_score", "is", null)
    .limit(40);
  if (error || !events?.length) return { rendered: 0, demoted: 0 };

  // Readiness gate, then editor SET-assembly.
  const ready = (events as EventRow[]).filter(
    (e) => hasOfficialFutureTime(e.starts_at) && Boolean(e.venue_name?.trim()) && Boolean(firstEventSource(e)),
  );
  const candidates: Array<ShelfCandidate & { event: EventRow }> = ready.map((e) => ({
    id: e.id,
    sub_library: e.sub_library ?? null,
    venue: e.venue_name,
    final_score: e.final_score ?? e.verdict_strength ?? 0,
    urgency: urgencyOf(e.urgency_assessment),
    starts_at: e.starts_at,
    event: e,
  }));
  const { featured } = selectEventsShelf(candidates, { limit: FEATURED_TARGET, maxPerSubLibrary: 3, maxPerVenue: 1 });
  const featuredIds = new Set(featured.map((f) => f.id));

  // Existing engine event cards (to adopt/insert/demote).
  const { data: cardRows } = await supabase
    .from("surfaced_items")
    .select("id, source_id, status, source, payload")
    .eq("user_id", userId)
    .eq("category", "events");
  const cardsByEvent = new Map<string, ExistingCard[]>();
  for (const row of (cardRows ?? []) as ExistingCard[]) {
    if (!row.source_id) continue;
    const list = cardsByEvent.get(row.source_id) ?? [];
    list.push(row);
    cardsByEvent.set(row.source_id, list);
  }

  let rendered = 0;
  for (const f of featured) {
    const e = f.event;
    const cards = cardsByEvent.get(e.id) ?? [];
    if (cards.some((c) => LOCKED_OR_ARCHIVED.has(c.status))) continue; // user owns / removed

    const live = cards.find((c) => c.status === "shown" || c.status === "discovered");
    if (live) {
      const payload = isRecord(live.payload) ? live.payload : {};
      const { error: upErr } = await supabase
        .from("surfaced_items")
        .update({
          status: "shown",
          destination: "radar",
          score: e.final_score ?? e.verdict_strength ?? null,
          payload: { ...payload, ...eventPayload(e), source_layer: ENGINE_SOURCE },
        })
        .eq("id", live.id)
        .eq("user_id", userId);
      if (!upErr) rendered += 1;
      continue;
    }
    if (cards.length > 0) continue; // only archived/other — don't resurrect

    const { error: insErr } = await supabase.from("surfaced_items").insert(buildEventCard(userId, e));
    if (!insErr) rendered += 1;
  }

  // Demote engine event cards that fell off the shelf (shown but not featured).
  let demoted = 0;
  for (const [eventId, cards] of cardsByEvent) {
    if (featuredIds.has(eventId)) continue;
    for (const c of cards) {
      if (c.status !== "shown") continue;
      if (LOCKED_OR_ARCHIVED.has(c.status)) continue;
      if (!isRecord(c.payload) || c.payload.source_layer !== ENGINE_SOURCE) continue;
      const { error: dErr } = await supabase
        .from("surfaced_items")
        .update({ status: "discovered" })
        .eq("id", c.id)
        .eq("user_id", userId);
      if (!dErr) demoted += 1;
    }
  }

  return { rendered, demoted };
}

function urgencyOf(a: unknown): string {
  return isRecord(a) && typeof a.urgency === "string" ? a.urgency : "normal";
}

function eventPayload(e: EventRow): Record<string, unknown> {
  const whyNow = eventWhyNow(e);
  return {
    event_id: e.id,
    event_type: e.event_type,
    sub_library: e.sub_library,
    named_entities: e.named_entities ?? [],
    venue_name: e.venue_name,
    library_place_id: e.library_place_id,
    verdict_strength: e.final_score ?? e.verdict_strength,
    why_now: whyNow,
    pillar_tags: eventPillars(e),
    verified_source_url: firstEventSource(e),
    official_starts_at: e.starts_at,
    event_time_locked: true,
  };
}

function buildEventCard(userId: string, e: EventRow): Record<string, unknown> {
  const whyNow = eventWhyNow(e);
  return {
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
    url: firstEventSource(e),
    type: "event",
    category: "events",
    tags: e.vibe_keywords ?? [],
    reasons: [whyNow, e.verdict ?? ""].filter(Boolean),
    score: e.final_score ?? e.verdict_strength ?? null,
    status: "shown",
    payload: { source_layer: ENGINE_SOURCE, ...eventPayload(e) },
  };
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
  final_score: number | null;
  sub_library: string | null;
  urgency_assessment: unknown;
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

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
