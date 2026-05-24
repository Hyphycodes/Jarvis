/**
 * Attention budget constants for the Radar curation system.
 *
 * Jarvis is NOT a feed. These constants enforce restraint at the code level —
 * not just as Claude prompt hints. The goal is a small, high-confidence front
 * room (Active Radar) and a quieter back room (Holding / Later).
 */

// ── Active Radar limits ─────────────────────────────────────────────────────

/** Minimum target for a healthy Radar board. Never padded with weak filler. */
export const RADAR_MIN_ACTIVE_ITEM_TARGET = 5;

/** Ideal number of items shown on Radar at any time. */
export const RADAR_IDEAL_ACTIVE_ITEM_LIMIT = 7;

/** Hard ceiling for shown Radar items. Above this, stale/low-scored items
 *  move to Holding or are reset to discovered. */
export const RADAR_ACTIVE_ITEM_LIMIT = 10;

/** Days before a "shown" Radar item is considered stale and eligible for
 *  rotation into Holding / Later. */
export const RADAR_STALE_SHOWN_DAYS = 14;

// ── Curation selection limits ────────────────────────────────────────────────

/** Default max items the Curator may select per run. */
export const RADAR_DEFAULT_SELECTED_LIMIT = 5;

/** Absolute max — Curator result is sliced to this even if Claude returns more. */
export const RADAR_HARD_SELECTED_LIMIT = RADAR_ACTIVE_ITEM_LIMIT;

/** Candidates passed to the Curator from the deterministic shortlist. */
export const RADAR_SHORTLIST_LIMIT = 20;

/** Minimum confidence score for a selection to reach Active Radar.
 *  Items below this threshold are routed to Holding or reset to discovered.
 *  An empty selected[] is always valid — silence is better than filler. */
export const RADAR_MIN_CONFIDENCE = 0.65;

// ── Category quotas (per refresh run) ────────────────────────────────────────

/** Max dining / restaurant items per refresh. */
export const MAX_DINING_PER_REFRESH = 3;

/** Max event items per refresh. */
export const MAX_EVENTS_PER_REFRESH = 3;

/** Max product / shopping items per refresh. */
export const MAX_PRODUCTS_PER_REFRESH = 2;

/** Max North / direction-oriented items per refresh. */
export const MAX_NORTH_IDEAS_PER_REFRESH = 2;

// ── Weekday energy limits ─────────────────────────────────────────────────────

/** On Mon–Fri: max items tagged "paid" or requiring paid commitment. */
export const RADAR_WEEKDAY_PAID_ITEM_LIMIT = 2;

/** On Mon–Fri: max items tagged "high-effort" (travel, all-day events, etc.). */
export const RADAR_WEEKDAY_HIGH_EFFORT_LIMIT = 1;

// ── Resurfacing rules ─────────────────────────────────────────────────────────

/** Days to wait before a "passed" item is eligible to re-enter the pool. */
export const PASSED_RESURFACE_DAYS = 30;

// ── Holding / Later ───────────────────────────────────────────────────────────

/** Max items to keep in Holding. If exceeded, oldest are archived. */
export const HOLDING_ITEM_LIMIT = 30;

/** Days before a Holding item is considered stale and archived. */
export const HOLDING_STALE_DAYS = 45;

// ── Source volume caps ────────────────────────────────────────────────────────

/** Hard cap on total candidates per gather run across all lanes. */
export const MAX_TOTAL_SOURCE_CANDIDATES_PER_REFRESH = 60;

/** Number of LocalRadar query groups to run per refresh. */
export const LOCAL_RADAR_MAX_QUERIES_PER_REFRESH = 6;

/** Results per LocalRadar query. */
export const LOCAL_RADAR_MAX_RESULTS_PER_QUERY = 5;

/** Max extracted article leads across all LocalRadar queries. */
export const LOCAL_RADAR_MAX_EXTRACTED_LEADS = 15;

// ── Refresh throttle ─────────────────────────────────────────────────────────

/** Minimum minutes between Radar refresh runs (cooldown). */
export const RADAR_REFRESH_COOLDOWN_MINUTES = 30;
