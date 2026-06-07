import "server-only";

import { actionTitleForItem } from "@/lib/brain/actionTitles";
import {
  getPurposeLabel,
  scoreAgainstTasteConstitution,
} from "@/lib/brain/tasteConstitution";
import { scoreSourceTrust, safeDomain } from "@/lib/intelligence/sourceTrust";
import { scoreCategoryCouncil } from "@/lib/brain/categoryCouncils";
import { normalizeRadarClassification } from "@/lib/radar/category";
import type { BrainContextPacket } from "@/lib/brain/types";
import type { ItemBriefing } from "@/lib/brain/briefingTypes";
import type { IndexedItem } from "@/lib/index/types";
import type {
  RadarAdmission,
  RadarCouncilContext,
  RadarDecision,
  RadarDisplayDepth,
} from "@/lib/brain/decisionCouncilTypes";

export const RADAR_ADMISSION_MIN_CONFIDENCE = 0.72;

// ── Occasion-aware confidence floors ─────────────────────────────────────────
// Maps occasion signals + time context to a modified confidence floor.
// The global 0.72 baseline is the default; these floors override it when the
// temporal and content context makes a candidate clearly more or less relevant.

const WEEKEND_OCCASIONS = new Set([
  // Canonical OCCASION_TYPES
  "weekend_day_move", "weekend_night_move", "casual_hang",
  "guys_night", "date_night", "family_time",
  // Ad-hoc lane names that surface in briefings
  "weekend_move", "active_social", "family_social",
]);

const AFTER_WORK_OCCASIONS = new Set([
  "weekday_after_work",
  "after_work_reset",
]);

const FOOD_OCCASIONS = new Set([
  "refined_dinner", "big_night_out",
  "food_dining",
]);

const BUSINESS_OCCASIONS = new Set([
  "business_room",
]);

const CULTURE_OCCASIONS = new Set([
  "cultural_anchor", "creative_session",
  "culture_creative",
]);

const WEEKDAY_NAMES: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Derive the time context string from context packet fields. Mirrors the
 *  logic in lib/north/laneVelocity.ts so occasion floors are consistent
 *  with the velocity profile even when timeContext is not explicitly passed. */
function deriveTimeContext(
  now: string,
  timezone?: string | null,
): string {
  try {
    const date = new Date(now);
    let hour = date.getHours();
    let dayOfWeek = date.getDay();
    if (timezone) {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        hour12: false,
        weekday: "short",
      }).formatToParts(date);
      const h = parts.find((p) => p.type === "hour");
      const w = parts.find((p) => p.type === "weekday");
      if (h) hour = parseInt(h.value, 10) % 24;
      if (w) dayOfWeek = WEEKDAY_NAMES[w.value] ?? dayOfWeek;
    }
    if (dayOfWeek === 0 || dayOfWeek === 6) return "weekend";
    if (hour >= 5 && hour < 11) return "morning";
    if (hour >= 11 && hour < 14) return "midday";
    if (hour >= 14 && hour < 19) return "after_work";
    if (hour >= 19) return "evening";
    return "midday";
  } catch {
    return "midday";
  }
}

/**
 * Returns the confidence floor appropriate for this candidate given its
 * occasion type and the current time context.
 *
 * Rules:
 *   Weekend anchor on weekend     → 0.68 (user is in receptive mode)
 *   After-work reset at after_work → 0.68 (high temporal relevance)
 *   Food & dining                  → 0.70 (frequent, quality still matters)
 *   Business / ownership           → 0.76 (fewer, sharper recommendations)
 *   Culture / creative             → 0.74 (curated feel, above baseline)
 *   Default                        → 0.72 (unchanged global baseline)
 *
 * When context.timeContext is not supplied, the function derives it from
 * context.brainContext fields — same algorithm as laneVelocity.ts, so the
 * result is always consistent with the velocity profile for the same run.
 */
function occasionConfidenceFloor(
  candidate: IndexedItem,
  context: RadarCouncilContext,
): number {
  const briefing = context.briefingOverride ?? candidate.briefing;
  const occasionType = briefing?.occasion_type ?? "";

  // Resolve time context: explicit > derived from brainContext > none
  const timeCtx =
    context.timeContext ??
    (context.brainContext?.now
      ? deriveTimeContext(
          context.brainContext.now,
          context.brainContext.founder?.timezone,
        )
      : null);

  // Weekend anchor: lower bar when timing and occasion align
  if (WEEKEND_OCCASIONS.has(occasionType) && timeCtx === "weekend") return 0.68;

  // After-work reset: same reasoning — high temporal relevance
  if (AFTER_WORK_OCCASIONS.has(occasionType) && timeCtx === "after_work") return 0.68;

  // Food & dining: slightly easier than default but quality still matters
  if (FOOD_OCCASIONS.has(occasionType)) return 0.70;

  // Business / ownership: higher bar — fewer, sharper
  if (BUSINESS_OCCASIONS.has(occasionType)) return 0.76;

  // Culture / creative: above baseline — should feel curated, not just found
  if (CULTURE_OCCASIONS.has(occasionType)) return 0.74;

  return RADAR_ADMISSION_MIN_CONFIDENCE;
}

const TERMINAL_ACTIONS = new Set(["ignore", "pass"]);
const HOLD_ACTIONS = new Set(["research", "watch"]);
const ARCHIVE_FLAGS = new Set([
  "social_noise",
  "instagram_noise",
  "facebook_noise",
  "raw_comment",
  "too_literal",
  "closed_event",
  "expired_event",
  "directory_spam",
  "seo_junk",
  "fake_luxury",
  "corny",
  "hype_noise",
]);
const BLOCKING_FLAGS = new Set([
  ...ARCHIVE_FLAGS,
  "weak_evidence",
  "misclassified",
  "no_clear_move",
  "title_unclear",
  "source_lead_only",
  "generic",
  "not_actionable",
  "no_current_value",
  "needs_verification",
]);

export function evaluateCandidateForRadar(
  candidate: IndexedItem,
  context: RadarCouncilContext = {},
): RadarDecision {
  const briefing = context.briefingOverride ?? candidate.briefing;
  const floor = occasionConfidenceFloor(candidate, context);
  const actionTitle = actionTitleForItem({ ...candidate, briefing });
  const taste = scoreAgainstTasteConstitution(
    { ...candidate, briefing },
    context.brainContext,
  );
  const purposeLabel =
    explicitPurposeLabel(candidate) ??
    getPurposeLabel({ ...candidate, briefing }, context.brainContext);
  const sourceTrust = scoreSourceTrust({
    url: candidate.url,
    title: candidate.title,
    snippet: candidate.description,
    publishedDate: stringFromPayload(candidate.rawPayload, "published_date"),
    age: stringFromPayload(candidate.rawPayload, "age"),
  });
  const flags = new Set<string>([
    ...actionTitle.flags,
    ...sourceTrust.qualityFlags,
    ...taste.negativeFlags,
  ]);

  if (!briefing) flags.add("needs_verification");
  if (candidate.source === "ai") {
    flags.delete("needs_verification");
    flags.delete("weak_evidence");
  }
  for (const flag of briefing?.quality_flags ?? []) flags.add(flag);
  if (isExpiredOrClosed(candidate)) flags.add("expired_event");
  if (isSourceLeadOnly(candidate, sourceTrust.sourceType)) flags.add("source_lead_only");
  if (!isValidClassification(candidate, sourceTrust.classificationHint)) {
    flags.add("misclassified");
  }
  if (!hasClearMove(actionTitle.title, briefing)) flags.add("no_clear_move");
  if (isWatchCopy(briefing)) flags.add("no_current_value");
  if (candidate.source !== "ai" && sourceTrust.trustScore < 0.5) flags.add("weak_evidence");

  // Phase 2: lane-specialized council. Adds its concerns to the flag set BEFORE
  // the critic scores them (so e.g. a generic dining room is penalized), and
  // contributes a category-aware score to the confidence blend.
  const radarCategory = normalizeRadarClassification({
    category: candidate.category,
    type: candidate.type,
    title: candidate.title,
    subtitle: candidate.subtitle,
    description: candidate.description,
    locationName: candidate.locationName,
    startsAt: candidate.startsAt,
    tags: candidate.tags,
    reasons: candidate.reasons,
    sourcePayload: candidate.rawPayload,
  }).category;
  const categoryCouncil = radarCategory
    ? scoreCategoryCouncil(candidate, radarCategory, context.brainContext)
    : null;
  if (categoryCouncil) {
    for (const f of categoryCouncil.flags) flags.add(f);
  }

  const councilScores = {
    scout: scoreScout(candidate, sourceTrust.trustScore, flags),
    operator: scoreOperator(candidate, briefing, context.brainContext),
    taste: taste.score,
    growth: scoreGrowth(candidate, purposeLabel, taste.positiveSignals),
    critic: scoreCritic(flags),
    category: categoryCouncil?.score ?? 0,
  };

  const briefingConfidence = briefing?.confidence ?? candidate.score ?? 0.5;
  // When a radar category is known, carve out a 0.13 slice for the lane council;
  // otherwise fall back to the original 6-term blend.
  const confidence = categoryCouncil
    ? clamp01(
        briefingConfidence * 0.30 +
          councilScores.scout * 0.15 +
          councilScores.operator * 0.12 +
          councilScores.taste * 0.15 +
          councilScores.growth * 0.07 +
          councilScores.critic * 0.08 +
          councilScores.category * 0.13,
      )
    : clamp01(
        briefingConfidence * 0.36 +
          councilScores.scout * 0.17 +
          councilScores.operator * 0.14 +
          councilScores.taste * 0.16 +
          councilScores.growth * 0.08 +
          councilScores.critic * 0.09,
      );
  if (confidence < floor) flags.add("no_current_value");

  const positiveSignals = unique([
    ...taste.positiveSignals,
    ...taste.laneMatches,
    ...(categoryCouncil?.signals ?? []),
    sourceTrust.sourceType === "trusted" ? "trusted source" : "",
    candidate.source === "ai" ? "contextual move" : "",
  ]);
  const negativeFlags = Array.from(flags);
  const oneLine = cleanLine(briefing?.one_line ?? candidate.description ?? candidate.subtitle);
  const bestMove = cleanLine(
    briefing?.jarvis_take ??
      (candidate.destination === "holding"
        ? "Good signal, not urgent."
        : "Save for comparison."),
  );

  const admission = decideAdmission({
    candidate,
    briefing,
    confidence,
    flags,
    floor,
  });
  const rejectionReason =
    admission === "radar"
      ? undefined
      : rejectionReasonFor(admission, briefing, negativeFlags, confidence, floor);

  return {
    admission,
    confidence,
    purpose_label: purposeLabel,
    move_title: actionTitle.title,
    one_line: oneLine,
    best_move: bestMove,
    display_depth: displayDepthFor(admission, confidence, negativeFlags, floor),
    positive_signals: positiveSignals,
    negative_flags: negativeFlags,
    council_scores: councilScores,
    rejection_reason: rejectionReason,
    appliedConfidenceFloor: floor,
  };
}

const GENERIC_WHY_NOW_PATTERNS = [
  /great weather/i,
  /highly rated/i,
  /haven't tried/i,
  /perfect for the season/i,
  /it'?s (a |an )?(friday|saturday|sunday|weekend)/i,
];

function isGenericWhyNow(whyNow: string | undefined): boolean {
  if (!whyNow || whyNow.trim().split(" ").length < 8) return true;
  return GENERIC_WHY_NOW_PATTERNS.some((p) => p.test(whyNow));
}

function decideAdmission(input: {
  candidate: IndexedItem;
  briefing?: ItemBriefing;
  confidence: number;
  flags: Set<string>;
  floor: number;
}): RadarAdmission {
  const { candidate, briefing, confidence, flags, floor } = input;
  const blocking = Array.from(flags).filter((flag) => BLOCKING_FLAGS.has(flag));
  if (briefing && TERMINAL_ACTIONS.has(briefing.best_next_action)) return "archive";
  if (blocking.some((flag) => ARCHIVE_FLAGS.has(flag))) return "archive";
  if (candidate.status === "archived" || candidate.status === "passed") return "archive";
  if (briefing?.suggested_destination === "archived") return "archive";
  if (briefing?.suggested_destination === "discovered") return "discovered";
  if (!briefing) return "holding";
  if (HOLD_ACTIONS.has(briefing.best_next_action)) return "holding";
  if (briefing.suggested_destination === "holding") return "holding";
  if (blocking.length > 0) return "holding";
  if (confidence < floor) return "holding";
  if (briefing.suggested_destination !== "radar") return "holding";
  // why_now gate: generic or missing why_now → demote to holding
  if (isGenericWhyNow(briefing.why_now)) return "holding";
  return "radar";
}

function rejectionReasonFor(
  admission: RadarAdmission,
  briefing: ItemBriefing | undefined,
  flags: string[],
  confidence: number,
  floor: number,
): string {
  if (admission === "archive") {
    return flags.length > 0
      ? `Archived by council: ${flags.slice(0, 3).join(", ")}`
      : `Archived by council: ${briefing?.best_next_action ?? "not useful"}`;
  }
  if (admission === "discovered") return "Kept as raw/discovered material.";
  if (flags.includes("no_current_value")) return "Good signal, not worth the front room now.";
  if (flags.includes("weak_evidence")) return "Interesting but source evidence is weak.";
  if (confidence < floor) {
    return `Below Radar confidence (${confidence.toFixed(2)}, floor ${floor.toFixed(2)}).`;
  }
  return "Good signal, not urgent.";
}

function scoreScout(
  candidate: IndexedItem,
  sourceTrust: number,
  flags: Set<string>,
): number {
  if (candidate.source === "ai") return flags.has("no_clear_move") ? 0.58 : 0.82;
  let score = sourceTrust;
  if (candidate.locationName || candidate.address || candidate.url) score += 0.08;
  if (candidate.startsAt || candidate.endsAt) score += 0.05;
  if (flags.has("source_lead_only")) score -= 0.18;
  if (flags.has("weak_evidence")) score -= 0.12;
  return clamp01(score);
}

function scoreOperator(
  candidate: IndexedItem,
  briefing: ItemBriefing | undefined,
  context?: BrainContextPacket,
): number {
  let score = 0.62;
  const rhythm = context?.weeklyRhythm;
  const now = context ? new Date(context.now) : new Date();
  const day = now.getDay();
  const workday = day >= 1 && day <= 5;
  const effort = briefing?.effort_level;
  const spend = briefing?.spending_posture;
  if (candidate.startsAt) score += 0.08;
  if (candidate.locationName || candidate.address) score += 0.05;
  if (effort === "low") score += 0.08;
  if (spend === "free" || spend === "low") score += 0.06;
  if (workday && effort === "high") score -= 0.12;
  if (workday && (spend === "paid" || spend === "high")) score -= 0.08;
  if (rhythm?.enabled && workday && isDuringWorkday(now, rhythm)) score -= 0.07;
  return clamp01(score);
}

function scoreGrowth(
  candidate: IndexedItem,
  purposeLabel: string,
  positiveSignals: string[],
): number {
  let score = 0.54 + positiveSignals.length * 0.06;
  if (/health|skill|ownership|creative|business|social|peace|taste/i.test(purposeLabel)) {
    score += 0.12;
  }
  if (candidate.source === "ai") score += 0.08;
  return clamp01(score);
}

function scoreCritic(flags: Set<string>): number {
  let score = 0.9;
  for (const flag of flags) {
    score -= BLOCKING_FLAGS.has(flag) ? 0.16 : 0.05;
  }
  return clamp01(score);
}

function isValidClassification(
  candidate: IndexedItem,
  classificationHint?: string,
): boolean {
  const category = `${candidate.category ?? ""} ${candidate.type}`.toLowerCase();
  const domain = safeDomain(candidate.url) ?? "";
  if (candidate.type === "place" && /youtube|instagram|facebook|article|style inspiration/.test(category)) {
    return false;
  }
  if (/instagram|facebook|youtube|youtu\.be/.test(domain) && candidate.type === "place") {
    return false;
  }
  if (domain.includes("articlesofstyle.com") && candidate.type === "place") {
    return false;
  }
  if (classificationHint === "events" && candidate.type === "place") return false;
  return Boolean(candidate.type && (candidate.category || candidate.type));
}

function isSourceLeadOnly(
  candidate: IndexedItem,
  sourceType: string,
): boolean {
  return (
    candidate.tags.includes("web-result") &&
    !candidate.locationName &&
    !candidate.startsAt &&
    candidate.source === "research" &&
    sourceType !== "trusted"
  );
}

function hasClearMove(title: string, briefing?: ItemBriefing): boolean {
  return (
    title.trim().length >= 4 &&
    !/move worth considering|lead to check|source lead|untitled/i.test(title) &&
    (briefing ? briefing.one_line.trim().length >= 12 : true)
  );
}

function isWatchCopy(briefing?: ItemBriefing): boolean {
  if (!briefing) return true;
  const text = `${briefing.display_title} ${briefing.one_line} ${briefing.jarvis_take} ${briefing.why_it_matters}`.toLowerCase();
  return /watch for stronger evidence|needs a better source|not decision-ready|good signal, weak evidence|hold, don.?t act/.test(text);
}

function isExpiredOrClosed(candidate: IndexedItem): boolean {
  const expires = candidate.expiresAt ? Date.parse(candidate.expiresAt) : NaN;
  if (!Number.isNaN(expires) && expires < Date.now()) return true;
  const text = [
    candidate.title,
    candidate.description,
    candidate.reasons.join(" "),
    candidate.briefing?.evidence_summary,
  ].join(" ").toLowerCase();
  return /sold out|registration closed|event ended|past event|closed/.test(text);
}

function displayDepthFor(
  admission: RadarAdmission,
  confidence: number,
  flags: string[],
  floor: number,
): RadarDisplayDepth {
  if (admission === "archive" || admission === "discovered") return "minimal";
  if (confidence < 0.6 || flags.includes("weak_evidence") || flags.includes("source_lead_only")) {
    return "minimal";
  }
  if (admission === "holding" || confidence < floor) return "compact";
  return "rich";
}

function explicitPurposeLabel(candidate: IndexedItem): string | undefined {
  const payload = isRecord(candidate.rawPayload) ? candidate.rawPayload : {};
  return typeof payload.purpose_label === "string" ? payload.purpose_label : undefined;
}

function stringFromPayload(payload: unknown, key: string): string | undefined {
  if (!isRecord(payload)) return undefined;
  return typeof payload[key] === "string" ? payload[key] : undefined;
}

function cleanLine(value: string | undefined): string {
  return (value ?? "Good signal, not urgent.")
    .replace(/local-radar:[^\s]+/gi, "")
    .replace(/seed:[^\s]+/gi, "")
    .replace(/#[\w-]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isDuringWorkday(
  now: Date,
  rhythm: NonNullable<BrainContextPacket["weeklyRhythm"]>,
): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = timeToMinutes(rhythm.workStart);
  const leave = timeToMinutes(rhythm.leaveWork);
  return minutes >= start && minutes <= leave;
}

function timeToMinutes(value: string): number {
  const [hh, mm] = value.split(":").map(Number);
  return (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
