import "server-only";

import { compressContext } from "@/lib/chat/context/compressContext";
import type { ChatContextPacket, KnownPlaceContext } from "@/lib/chat/context/types";
import type { ChatIntent } from "@/lib/chat/types";

export function renderChatSystemPrompt(
  packet: ChatContextPacket,
  options: {
    intent?: ChatIntent;
    sheetContext?: string;
    intakeSummary?: string;
  } = {},
): string {
  const c = compressContext(packet);
  const lines: string[] = [];

  lines.push("You are Jarvis — a quiet, already-briefed operator. You think ahead, move things forward, and say less than you know. You are never a chatbot.");
  lines.push("");
  lines.push("- Short. One clear take. No preamble, no throat-clearing.");
  lines.push("- Confident, not hedged. \"Naia Friday — good call.\" Not \"That sounds like a great idea!\"");
  lines.push("- Never say \"Great question\", \"Certainly\", \"Of course\", \"I'd be happy to\", or \"As your assistant\".");
  lines.push("- Give a take, not a report. Plain prose only unless emitting chips.");
  lines.push("- When you act, move — don't narrate moving.");
  lines.push("- When you don't know something, say so in one line. Don't apologize.");
  lines.push("- Never re-explain context the user already knows. They live here.");
  lines.push("- Offer next actions, but do not plan, book, schedule, or commit unless the user explicitly confirms.");
  lines.push("- If the user taps or says Plan It, Build Plan, Book It, Add to Calendar, or Make this happen, then commitment mode is allowed.");
  lines.push("- When an action chip is supplied for build_plan and the user stated timing, include payload.timing_hint (for example \"Friday evening\" or \"this week\"). Include payload.party_size if the user states a clear group size.");
  lines.push("");
  lines.push("At the end of your response, if there is a clear next action, emit it as a chip — don't ask about it as prose. A question AND a chip for the same thing is redundant. Pick one. Chips replace questions.");
  lines.push("");
  lines.push("Format: output after your prose on a new line, wrapped in <chips>...</chips>:");
  lines.push("[{\"label\": \"Put on Radar\", \"action_type\": \"save_to_radar\", \"message\": \"Put Naia on Radar for Friday evening.\"}]");
  lines.push("");
  lines.push("Chip types: save_to_radar | add_to_calendar | build_plan | remember | find_similar | enable_push");
  lines.push("Only emit chips when confident. No chip for pure information exchanges.");
  lines.push("");
  lines.push(`Today: ${c.today.localDateLabel} (${c.today.timezone}). Home base: ${c.today.homeCity ?? "unknown"}.`);
  if (c.today.weather) {
    lines.push(`Weather: ${Math.round(c.today.weather.temperatureF)}F, wind ${Math.round(c.today.weather.windMph)} mph.`);
  }
  if (options.intent) lines.push(`Current intent route: ${options.intent}.`);
  if (options.sheetContext) {
    lines.push(`Current context: ${options.sheetContext}`);
    lines.push(`Use this as the default subject if the message is short or ambiguous. If they're clearly talking about something else, follow their lead — context is ambient, not a constraint.`);

    // Page-specific posture
    if (options.sheetContext.includes("Radar") && options.sheetContext.includes("viewing")) {
      lines.push(`They may be considering the visible item. Don't re-explain it — add to their read or move it forward.`);
    } else if (options.sheetContext.includes("active plan")) {
      lines.push(`They're looking at a specific plan. "Change this", "what if it rains", "adjust the after" all refer to this plan unless they say otherwise.`);
    } else if (options.sheetContext.includes("Circle tab")) {
      lines.push(`Relationship mode. Think about people, not places.`);
    } else if (options.sheetContext.includes("North")) {
      lines.push(`Long-arc mode. Think direction and growth, not tonight.`);
    }
  }

  if (c.user.vibeKeywords.length) lines.push(`Taste words: ${c.user.vibeKeywords.slice(0, 8).join(", ")}.`);
  if (c.user.avoidKeywords.length) lines.push(`Avoid: ${c.user.avoidKeywords.slice(0, 8).join(", ")}.`);
  if (c.user.dealbreakers.length) lines.push(`Dealbreakers: ${c.user.dealbreakers.slice(0, 5).join(" | ")}.`);
  if (c.user.currentFocus) lines.push(`Current focus: ${c.user.currentFocus}.`);
  if (c.user.lifeDirection) lines.push(`Long arc: ${c.user.lifeDirection}.`);

  if (c.preferences.length) {
    lines.push(
      `Stable memory/taste: ${c.preferences
        .slice(0, 12)
        .map((p) => p.content)
        .join(" | ")}.`,
    );
  }
  if (c.constraints.length) {
    lines.push(
      `Constraints: ${c.constraints
        .slice(0, 8)
        .map((p) => p.summary)
        .join(" | ")}.`,
    );
  }
  if (c.activePlans.length) {
    lines.push(
      `Active/nearby plans: ${c.activePlans
        .map((p) => `${p.title} (${p.status}${p.scheduledDate ? ` ${p.scheduledDate}` : ""})`)
        .join(" | ")}.`,
    );
  }
  if (c.radar.length) {
    lines.push(
      `Radar waiting: ${c.radar
        .map((r) => `${r.title} (${r.status}${r.tasteFitSummary ? `: ${r.tasteFitSummary}` : ""})`)
        .join(" | ")}.`,
    );
  }
  if (c.knownPlaces.length) {
    lines.push("");
    lines.push("Places you already know about (the owner's curated library):");
    for (const place of c.knownPlaces.slice(0, 40)) {
      lines.push(`- ${renderKnownPlace(place)}`);
    }
    lines.push(
      "When the user references a place by description or partial name (\"the Greek place on the river\", \"that new spot in Fulton Market\"), first check this list and resolve to the matching known place before saying you don't have it. Only ask for clarification if nothing plausibly matches.",
    );
  }
  if (c.circle.length) {
    lines.push(
      `Circle context: ${c.circle
        .map((p) => `${p.name}${p.role ? ` (${p.role})` : ""}`)
        .join(", ")}.`,
    );
  }
  if (c.recentSignals.length) {
    lines.push(
      `Recent signals: ${c.recentSignals
        .slice(0, 8)
        .map((s) => s.signalType)
        .join(", ")}.`,
    );
  }
  if (options.intakeSummary) {
    lines.push("");
    lines.push("[INTAKE SUMMARY]");
    lines.push(options.intakeSummary);
  }

  return lines.join("\n");
}

/** Compact one-liner, e.g. "Naia — Greek, Fulton Market, riverside/refined (strength 0.78)". */
function renderKnownPlace(place: KnownPlaceContext): string {
  const descriptors = [
    place.cuisineOrFocus ?? place.placeType,
    place.neighborhood,
    place.vibeKeywords.slice(0, 3).join("/") || null,
  ].filter((d): d is string => Boolean(d && d.trim()));

  let line = place.name;
  if (descriptors.length) line += ` — ${descriptors.join(", ")}`;
  if (place.verdict) line += `. ${place.verdict.trim()}`;
  if (place.bestFor.length) line += ` Best for: ${place.bestFor.slice(0, 3).join(", ")}.`;
  if (place.verdictStrength != null) line += ` (strength ${place.verdictStrength.toFixed(2)})`;
  return line;
}
