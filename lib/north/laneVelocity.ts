/**
 * Lane Velocity — time-of-week pre-bias for Taste Strategist exploration lanes.
 *
 * Pure function: no async, no DB calls, no I/O. Safe to call from any context.
 * The goal is to give Jarvis a temporal reflex before a Strategist fires, so
 * after-work moves surface on weekday evenings and weekend anchors surface on
 * Saturdays without any instruction from the founder.
 *
 * Two layers:
 * 1. Time context — hard-coded time-of-week weight map (always applied).
 * 2. Behavioral reinforcement — detects engagement density in the same
 *    time window over the last 14 days to confirm or extend the time-context
 *    priority. Falls back to time-context only when signal data is sparse.
 */

export type TimeContext =
  | "morning"
  | "midday"
  | "after_work"
  | "evening"
  | "weekend";

export interface LaneVelocityProfile {
  /** Lane names to weight up right now. */
  priorityLanes: string[];
  /** Lane names to weight down right now. */
  suppressedLanes: string[];
  timeContext: TimeContext;
  /** One-line reasoning for prompt injection. */
  reasoning: string;
}

// ── Lane vocabulary ──────────────────────────────────────────────────────────
// Conceptual lane names that map to occasion_types, interest areas, and
// item categories. These strings flow into the strategist prompt and the router
// scoring map — any change here must be mirrored in LANE_CATEGORY_MAP in
// router.ts.

const LANES = {
  FOOD_DINING:     "food_dining",
  ACTIVE_SOCIAL:   "active_social",
  WEEKEND_MOVE:    "weekend_move",
  CULTURE_CREATIVE:"culture_creative",
  AFTER_WORK:      "after_work_reset",
  BUSINESS:        "business_room",
  SKILL:           "skill_learning",
} as const;

// ── Base time-context weights ────────────────────────────────────────────────

type TimeWeight = { priority: string[]; suppressed: string[] };

const BASE: Record<TimeContext, TimeWeight> = {
  weekend: {
    priority: [LANES.WEEKEND_MOVE, LANES.ACTIVE_SOCIAL, LANES.FOOD_DINING, LANES.CULTURE_CREATIVE],
    suppressed: [LANES.AFTER_WORK, LANES.BUSINESS],
  },
  after_work: {
    priority: [LANES.AFTER_WORK, LANES.FOOD_DINING, LANES.ACTIVE_SOCIAL],
    suppressed: [LANES.WEEKEND_MOVE, LANES.BUSINESS],
  },
  morning: {
    priority: [LANES.BUSINESS, LANES.SKILL],
    suppressed: [LANES.CULTURE_CREATIVE, LANES.FOOD_DINING],
  },
  evening: {
    priority: [LANES.CULTURE_CREATIVE, LANES.FOOD_DINING],
    suppressed: [LANES.ACTIVE_SOCIAL, LANES.BUSINESS],
  },
  midday: {
    priority: [],
    suppressed: [],
  },
};

const REASONING: Record<TimeContext, string> = {
  weekend:    "Weekend mode: leisure, social, and cultural exploration prioritized.",
  after_work: "After-work window: reset and social moves take precedence over planning.",
  morning:    "Morning block: focus and skill lanes over heavy social or dining.",
  evening:    "Evening window: culture and dining win over late-to-plan social moves.",
  midday:     "Midday: balanced — no strong directional pull.",
};

// ── Signal types that count as engagement reps ───────────────────────────────

function isEngagementSignal(signalType: string): boolean {
  const lower = signalType.toLowerCase();
  return (
    lower.endsWith(".save") ||
    lower.endsWith(".plan") ||
    lower.endsWith(".complete") ||
    lower.endsWith(".open") ||
    lower === "item.save" ||
    lower === "radar.save" ||
    lower === "item.plan" ||
    lower === "item.complete" ||
    lower === "item.open"
  );
}

// ── Local time helpers ───────────────────────────────────────────────────────

type LocalComponents = { hour: number; dayOfWeek: number };

const WEEKDAY_NAMES: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function getLocalComponents(date: Date, timezone?: string | null): LocalComponents {
  if (!timezone) {
    return { hour: date.getHours(), dayOfWeek: date.getDay() };
  }
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
      weekday: "short",
    }).formatToParts(date);
    const hourPart = parts.find((p) => p.type === "hour");
    const weekdayPart = parts.find((p) => p.type === "weekday");
    const hour = hourPart ? parseInt(hourPart.value, 10) % 24 : date.getHours();
    const dayOfWeek = weekdayPart
      ? (WEEKDAY_NAMES[weekdayPart.value] ?? date.getDay())
      : date.getDay();
    return { hour, dayOfWeek };
  } catch {
    return { hour: date.getHours(), dayOfWeek: date.getDay() };
  }
}

function classifyTimeContext(hour: number, dayOfWeek: number): TimeContext {
  if (dayOfWeek === 0 || dayOfWeek === 6) return "weekend";
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "midday";
  if (hour >= 14 && hour < 19) return "after_work";
  if (hour >= 19) return "evening";
  return "midday"; // midnight–5am: balanced default
}

// ── Main export ──────────────────────────────────────────────────────────────

export type SignalInput = {
  signal_type: string;
  created_at: string;
};

/**
 * Compute the lane velocity profile for the current moment.
 *
 * @param signals  Recent behavior signals from BrainContextPacket.recentSignals.
 *                 Used only for behavioral reinforcement; time-context is always applied.
 * @param now      Current wall-clock time in UTC.
 * @param timezone IANA timezone string (e.g. "America/Chicago"). When omitted,
 *                 local-time computation falls back to the runtime's UTC offset.
 */
export function getLaneVelocity(
  signals: SignalInput[],
  now: Date,
  timezone?: string | null,
): LaneVelocityProfile {
  const { hour, dayOfWeek } = getLocalComponents(now, timezone);
  const timeContext = classifyTimeContext(hour, dayOfWeek);
  const base = BASE[timeContext];

  // ── Behavioral reinforcement ─────────────────────────────────────────────
  // Scan the last 14 days for engagement signals that fall in the same
  // time context as now. 2+ historical signals in this window confirm the
  // pattern and reinforce the base priority. Signals don't carry category,
  // so we can only detect *density* (not content) — that is enough to
  // validate or extend the time-context priority lanes.

  const reinforcedLanes = new Set<string>();

  try {
    const windowMs = 14 * 24 * 60 * 60 * 1000;
    const since = now.getTime() - windowMs;

    const relevant = signals.filter((s) => {
      if (!isEngagementSignal(s.signal_type)) return false;
      const ts = new Date(s.created_at).getTime();
      return Number.isFinite(ts) && ts >= since;
    });

    // Group by (same day-of-week, same time context) — historical pattern match
    const sameDayAndContext = relevant.filter((s) => {
      const date = new Date(s.created_at);
      const local = getLocalComponents(date, timezone);
      return (
        local.dayOfWeek === dayOfWeek &&
        classifyTimeContext(local.hour, local.dayOfWeek) === timeContext
      );
    });

    if (sameDayAndContext.length >= 2) {
      // Confirmed engagement pattern on this day+time — reinforce base priority
      for (const lane of base.priority) reinforcedLanes.add(lane);
    }

    // Also check: any engagement on same day-of-week regardless of time context
    // (2+ is the threshold for a day-level pattern)
    const sameDay = relevant.filter((s) => {
      const local = getLocalComponents(new Date(s.created_at), timezone);
      return local.dayOfWeek === dayOfWeek;
    });

    if (sameDay.length >= 2 && timeContext !== "midday") {
      // Day-level engagement — add the time-context priority lanes if not already suppressed
      for (const lane of base.priority) {
        if (!base.suppressed.includes(lane)) reinforcedLanes.add(lane);
      }
    }
  } catch {
    // Signal timestamps unavailable or malformed — time-context only (no reinforcement)
  }

  const priorityLanes = unique([
    ...base.priority,
    // Only add reinforced lanes that aren't suppressed
    ...Array.from(reinforcedLanes).filter((l) => !base.suppressed.includes(l)),
  ]);

  return {
    priorityLanes,
    suppressedLanes: base.suppressed,
    timeContext,
    reasoning: REASONING[timeContext],
  };
}

function unique(arr: string[]): string[] {
  return Array.from(new Set(arr));
}
