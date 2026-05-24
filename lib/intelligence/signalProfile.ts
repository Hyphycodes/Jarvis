import "server-only";

import { actionTitleForItem } from "@/lib/brain/actionTitles";
import { purposeLabelForItem } from "@/lib/brain/purposeLabels";
import { sourceDomainForItem } from "@/lib/items/considerationBrief";
import { scoreSourceTrust } from "@/lib/intelligence/sourceTrust";
import { readTaste } from "@/lib/intelligence/taste";
import { readRhythm } from "@/lib/intelligence/rhythm";
import { readTruth } from "@/lib/intelligence/truth";
import type { IndexedItem } from "@/lib/index/types";
import type { JarvisContext, RadarVibe, SignalProfile } from "@/lib/intelligence/types";

export function profileSignal(
  item: IndexedItem,
  context?: JarvisContext,
): SignalProfile {
  const briefing = item.briefing;
  const actionTitle = actionTitleForItem(item);
  const purposeLabel = purposeLabelForItem(item);
  const sourceTrust = scoreSourceTrust({
    url: item.url,
    title: item.title,
    snippet: item.description,
  });
  const taste = readTaste(item, context);
  const rhythm = readRhythm(item, context);
  const truth = readTruth(item);
  const category = cleanCategory(item.category ?? item.type);
  const type = cleanCategory(item.type);
  const vibe = inferVibe(item, purposeLabel);
  const confidence = clamp01(
    (briefing?.confidence ?? item.score ?? 0.52) * 0.5 +
      taste.score * 0.18 +
      rhythm.score * 0.14 +
      truth.evidenceQuality * 0.18,
  );
  const effort = briefing?.effort_level ?? "unknown";
  const spend = briefing?.spending_posture ?? "unknown";

  return {
    category,
    type,
    vibe,
    diversityGroup: diversityGroupFor(vibe, category, item),
    urgency: item.startsAt ? 0.72 : 0.42,
    effort,
    spend,
    timingWindow: item.startsAt ?? item.endsAt ?? briefing?.why_now,
    socialWeight: /social|dining|cigar|coffee|room|relationship/i.test(purposeLabel) ? 0.72 : 0.4,
    tasteFit: taste.score,
    novelty: noveltyFor(item),
    practicalFriction: effort === "high" ? 0.72 : effort === "medium" ? 0.48 : 0.28,
    confidence,
    evidenceQuality: truth.evidenceQuality,
    sourceDomain: sourceDomainForItem(item) ?? sourceTrust.domain,
    sourceTrust: sourceTrust.trustScore,
    purposeLabel,
    moveTitle: actionTitle.title,
    reasonSurfaced:
      briefing?.why_it_matters ??
      item.reasons[0] ??
      `${purposeLabel}. ${rhythm.label}.`,
    strongestAngle:
      briefing?.jarvis_take ??
      item.reasons[1] ??
      "Good signal if it stays clean and useful.",
    suggestedAction: briefing?.best_next_action ?? "save",
    negativeFlags: Array.from(
      new Set([
        ...actionTitle.flags,
        ...sourceTrust.qualityFlags,
        ...taste.negativeFlags,
        ...truth.flags,
        ...(briefing?.quality_flags ?? []),
      ]),
    ),
    positiveSignals: Array.from(new Set([...taste.positiveSignals, ...taste.laneMatches])),
  };
}

export function inferVibe(item: IndexedItem, purposeLabel?: string): RadarVibe {
  const text = [
    item.type,
    item.category,
    item.title,
    item.subtitle,
    item.description,
    purposeLabel,
    item.tags.join(" "),
    item.briefing?.display_title,
    item.briefing?.one_line,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/dinner|steak|cigar|lounge|low-lit|hotel|cocktail/.test(text)) return "cinematic_night";
  if (/quiet|coffee|reset|recovery|peace|solo|walk/.test(text)) return "solo_recharge";
  if (/basketball|gym|mobility|health|recovery|sunlight/.test(text)) return "body_reset";
  if (/dj|crate|camera|visual|creative|music|verse|content/.test(text)) return "creative_spark";
  if (/land|real estate|property|wealth|comp|ownership/.test(text)) return "money_move";
  if (/relationship|friend|invite|social|family/.test(text)) return "relationship_maintenance";
  if (/menswear|watch|style|tailor|leather|seiko|product|boutique/.test(text)) return "stylish_purchase";
  if (/jazz|gallery|culture|reader|do312|event|concert|screening/.test(text)) return "culture_with_taste";
  if (/errand|tactical|pickup|repair|shop/.test(text)) return "tactical_errand";
  if (/work|business|system|marketing|outreach|investor/.test(text)) return "work_leverage";
  if (/horse|golf|forest|trail|outdoor|range|motocross/.test(text)) return "land_escape";
  if (/quiet luxury|refined|understated/.test(text)) return "quiet_luxury";
  return "useful_move";
}

function cleanCategory(value: string): string {
  return value.replace(/_/g, " ").trim() || "move";
}

function diversityGroupFor(vibe: RadarVibe, category: string, item: IndexedItem): string {
  if (/dining|restaurant|coffee|cafe/.test(`${category} ${item.type}`.toLowerCase())) {
    return "food";
  }
  if (/event|culture|music/.test(`${category} ${item.type}`.toLowerCase())) {
    return "culture";
  }
  if (/style|product/.test(`${category} ${item.type}`.toLowerCase())) {
    return "style";
  }
  if (/real estate|land|ownership/.test(`${category} ${item.type}`.toLowerCase())) {
    return "ownership";
  }
  return vibe;
}

function noveltyFor(item: IndexedItem): number {
  const text = `${item.title} ${item.tags.join(" ")}`.toLowerCase();
  if (/new|opening|first|limited|release|preview|weekend/.test(text)) return 0.76;
  if (/routine|daily|weekly|reset/.test(text)) return 0.52;
  return 0.62;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

