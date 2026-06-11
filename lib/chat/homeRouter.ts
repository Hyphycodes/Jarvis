import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { createIndexItem } from "@/lib/index/repo";
import { createStubPlan, fillPlan } from "@/lib/actions/plans";
import { upsertTasteReference } from "@/lib/taste/references";

/**
 * THE MIC IS THE ROUTER. Everything said has a right home, and this module
 * sends it there — as real writes, not observations waiting for review:
 *
 * - a taste ("no loud spots", the Oakbrook paragraph) → taste_signals + the
 *   reference canon, with a reflection IN HIS WORDS to read back
 * - a fact about a person → their circle_people profile (notes, dates, gifts)
 * - a direction ("focus on Body this month") → a north signal
 * - a date or occasion → calendar + a plan, pre-staged before the day matters
 *
 * One structured extraction per routable utterance; every write traces to
 * something the user actually said.
 */

export type HomeRoute = {
  /** What was written where — feeds the model so the reply reflects reality. */
  contextBlock: string | null;
  /** Reflection sentence for taste updates (read back in his words). */
  tasteReflection: string | null;
  routedTaste: boolean;
  routedPeople: string[];
  routedNorth: boolean;
  routedOccasion: string | null;
};

const EMPTY: HomeRoute = {
  contextBlock: null,
  tasteReflection: null,
  routedTaste: false,
  routedPeople: [],
  routedNorth: false,
  routedOccasion: null,
};

/** Cheap gate so we don't spend an extraction call on every utterance. */
export function looksRoutable(message: string): boolean {
  return (
    /\b(love|hate|never|always|not (a )?fan|can't stand|don't like|moved? me|my (style|taste|vibe)|too (loud|flashy|corny|touristy|basic)|quality|i'm down to pay|i'd pay)\b/i.test(
      message,
    ) ||
    /\b(birthday|anniversary|wedding|party|graduation|dinner with|is on the \d|on the \d{1,2}(st|nd|rd|th)|next (week|month|friday|saturday|sunday))\b/i.test(
      message,
    ) ||
    /\b(focus on|this month i|prioritize|lean into)\b/i.test(message) ||
    /\b(remember|note) (that )?\b/i.test(message)
  );
}

type Extraction = {
  taste?: {
    signals?: Array<{ trait?: string; direction?: string; category?: string }>;
    references?: Array<{ name?: string; kind?: string; lane?: string; why?: string }>;
    reflection?: string;
  } | null;
  person_facts?: Array<{
    name?: string;
    fact?: string;
    important_date?: { label?: string; date?: string } | null;
    gift_idea?: string | null;
  }> | null;
  north?: { pillar?: string; direction?: string } | null;
  occasion?: {
    title?: string;
    date?: string;
    time?: string;
    people?: string[];
    notes?: string;
  } | null;
};

const EXTRACT_SYSTEM = `You are Jarvis's ROUTER. The owner said something; extract ONLY what should be written to a home, in strict JSON. Extract nothing that wasn't actually said — no inference beyond the words, no invented details.

Homes:
- taste: durable preferences. signals = [{trait (short phrase in HIS words), direction ("positive"|"negative"), category? (dining|style|music|venue|general)}]. references = named real things he loves (kind "yes") or that leave him cold (kind "no"), with lane (dining|events|culture|places|finds|moves) when clear and why (his reason, short). reflection = ONE sentence reflecting his taste back in his own words so he can correct it (e.g. "Quality over hype — you'll pay up when the make is real; the Nordstrom house labels never moved you."). Only include taste when he expressed a real preference, not a passing mood.
- person_facts: facts about specific named people (not himself). fact = the thing to remember, short. important_date when a date for that person was given ({label like "birthday"/"their kid's birthday", date as YYYY-MM-DD or MM-DD}). gift_idea when he mentioned a gift idea for them.
- north: only when he explicitly set a direction ("focus on Body this month"). pillar one of body|skill|creative|ownership|taste|relationships|peace.
- occasion: a dated commitment in HIS life (a birthday on the 20th, dinner Friday). title short, date as YYYY-MM-DD (resolve relative dates from the provided now), time HH:MM if said, people = named people involved. NOT a vague wish — only a real dated thing.

Omit (null) any home that doesn't apply. Most utterances route to zero or one home.`;

export async function routeUtteranceToHomes(input: {
  userId: string;
  message: string;
  supabase: SupabaseClient;
  now?: Date;
}): Promise<HomeRoute> {
  if (!hasAnthropic()) return EMPTY;

  let raw: unknown;
  try {
    raw = await generateStructured<unknown>({
      system: EXTRACT_SYSTEM,
      prompt: JSON.stringify({
        now: (input.now ?? new Date()).toISOString(),
        timezone: "America/Chicago",
        utterance: input.message,
      }),
      schemaName: "home_router_extraction",
      temperature: 0.1,
      maxTokens: 1200,
    });
  } catch (error) {
    console.error("[homeRouter] extraction failed", error);
    return EMPTY;
  }
  const extracted = (isRecord(raw) ? raw : {}) as Extraction;

  const did: string[] = [];
  const result: HomeRoute = { ...EMPTY, routedPeople: [] };

  // ── Taste → taste_signals + reference canon ────────────────────────────────
  if (isRecord(extracted.taste)) {
    const signals = Array.isArray(extracted.taste.signals) ? extracted.taste.signals : [];
    const references = Array.isArray(extracted.taste.references)
      ? extracted.taste.references
      : [];
    let wrote = 0;
    for (const sig of signals.slice(0, 6)) {
      const trait = str(sig?.trait);
      const direction = sig?.direction === "negative" ? "negative" : "positive";
      if (!trait) continue;
      const { error } = await input.supabase.from("taste_signals").insert({
        user_id: input.userId,
        trait,
        direction,
        category: str(sig?.category),
        weight: 1,
        confidence: 0.75,
        source: "voice",
      });
      if (!error) wrote += 1;
    }
    for (const ref of references.slice(0, 6)) {
      const name = str(ref?.name);
      if (!name) continue;
      await upsertTasteReference({
        userId: input.userId,
        name,
        kind: ref?.kind === "no" ? "no" : "yes",
        lane: str(ref?.lane),
        note: str(ref?.why),
        source: "voice",
        supabase: input.supabase,
      });
      wrote += 1;
    }
    if (wrote > 0) {
      result.routedTaste = true;
      result.tasteReflection = str(extracted.taste.reflection);
      did.push(
        `Taste profile updated (${wrote} signal${wrote === 1 ? "" : "s"}/reference${wrote === 1 ? "" : "s"}).` +
          (result.tasteReflection
            ? ` Reflect it back to him in one line so he can correct it: "${result.tasteReflection}"`
            : ""),
      );
    }
  }

  // ── Person facts → circle_people ───────────────────────────────────────────
  const personFacts = Array.isArray(extracted.person_facts) ? extracted.person_facts : [];
  for (const pf of personFacts.slice(0, 4)) {
    const name = str(pf?.name);
    if (!name) continue;
    const written = await writePersonFact(input.supabase, input.userId, {
      name,
      fact: str(pf?.fact),
      importantDate:
        isRecord(pf?.important_date) && str(pf.important_date.date)
          ? { label: str(pf.important_date.label) ?? "important date", date: str(pf.important_date.date)! }
          : null,
      giftIdea: str(pf?.gift_idea),
    });
    if (written) {
      result.routedPeople.push(name);
      did.push(`Saved to ${name}'s Circle profile.`);
    }
  }

  // ── North direction → north_signals ────────────────────────────────────────
  if (isRecord(extracted.north) && str(extracted.north.pillar) && str(extracted.north.direction)) {
    const pillarTitle = str(extracted.north.pillar)!;
    const { data: pillar } = await input.supabase
      .from("north_pillars")
      .select("id, title")
      .eq("user_id", input.userId)
      .ilike("title", pillarTitle)
      .maybeSingle();
    if (pillar?.id) {
      const { error } = await input.supabase.from("north_signals").insert({
        user_id: input.userId,
        pillar_id: pillar.id,
        title: `Direction: ${str(extracted.north.direction)}`,
        summary: input.message.slice(0, 240),
        source: "manual",
      });
      if (!error) {
        result.routedNorth = true;
        did.push(`North: ${pillarTitle} direction noted — it now tilts the scale quietly.`);
      }
    }
  }

  // ── Occasion → calendar item + pre-staged plan ─────────────────────────────
  if (isRecord(extracted.occasion) && str(extracted.occasion.title) && str(extracted.occasion.date)) {
    const title = str(extracted.occasion.title)!;
    const startsAt = resolveStartsAt(str(extracted.occasion.date)!, str(extracted.occasion.time));
    if (startsAt) {
      try {
        const item = await createIndexItem({
          type: "plan",
          destination: "upcoming",
          title,
          source: "manual",
          status: "planned",
          startsAt,
          description: str(extracted.occasion.notes) ?? undefined,
          tags: ["occasion", "voice"],
          rawPayload: {
            occasion: true,
            people: Array.isArray(extracted.occasion.people)
              ? extracted.occasion.people.filter((p): p is string => typeof p === "string")
              : [],
          },
        });
        result.routedOccasion = title;
        did.push(`On the calendar: ${title} (${startsAt.slice(0, 10)}). Plan is being staged.`);
        // Pre-stage the plan in the background — by the time the day matters,
        // it's already sitting there waiting.
        void (async () => {
          try {
            const stub = await createStubPlan({
              itemId: item.id,
              userId: input.userId,
              preserveItemSurface: true,
            });
            await fillPlan({
              planId: stub.planId,
              userId: input.userId,
              itemId: item.id,
              preserveItemSurface: true,
              persistFallback: true,
            });
          } catch (err) {
            console.error("[homeRouter] occasion plan staging failed", err);
          }
        })();
      } catch (err) {
        console.error("[homeRouter] occasion item failed", err);
      }
    }
  }

  if (did.length === 0) return EMPTY;
  result.contextBlock = [
    "[ROUTED — already done, speak as if handled]",
    ...did.map((d) => `- ${d}`),
    "Acknowledge naturally in ONE short line; never mention systems, tables, or 'memory updated'.",
  ].join("\n");
  return result;
}

async function writePersonFact(
  supabase: SupabaseClient,
  userId: string,
  fact: {
    name: string;
    fact: string | null;
    importantDate: { label: string; date: string } | null;
    giftIdea: string | null;
  },
): Promise<boolean> {
  if (!fact.fact && !fact.importantDate && !fact.giftIdea) return false;
  const { data: existing } = await supabase
    .from("circle_people")
    .select("id, notes, important_dates, gift_ideas")
    .eq("user_id", userId)
    .ilike("name", fact.name)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  const notes = Array.isArray(existing?.notes) ? [...(existing!.notes as string[])] : [];
  if (fact.fact) notes.push(fact.fact);
  const dates = Array.isArray(existing?.important_dates)
    ? [...(existing!.important_dates as unknown[])]
    : [];
  if (fact.importantDate) {
    const dup = dates.some(
      (d) => isRecord(d) && d.label === fact.importantDate!.label && d.date === fact.importantDate!.date,
    );
    if (!dup) dates.push(fact.importantDate);
  }
  const gifts = Array.isArray(existing?.gift_ideas)
    ? [...(existing!.gift_ideas as unknown[])]
    : [];
  if (fact.giftIdea) gifts.push({ idea: fact.giftIdea, added_at: nowIso });

  if (existing?.id) {
    const { error } = await supabase
      .from("circle_people")
      .update({
        notes: notes.slice(-30),
        important_dates: dates,
        gift_ideas: gifts.slice(-30),
        updated_at: nowIso,
      })
      .eq("id", existing.id)
      .eq("user_id", userId);
    return !error;
  }
  const { error } = await supabase.from("circle_people").insert({
    user_id: userId,
    name: fact.name,
    category: "homies",
    closeness_score: 0.5,
    notes: notes.slice(-30),
    important_dates: dates,
    gift_ideas: gifts,
  });
  return !error;
}

function resolveStartsAt(date: string, time: string | null): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!dateMatch) return null;
  const hhmm = time && /^\d{2}:\d{2}$/.test(time.trim()) ? time.trim() : "18:00";
  const iso = `${date.trim()}T${hhmm}:00-05:00`; // America/Chicago wall clock
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
