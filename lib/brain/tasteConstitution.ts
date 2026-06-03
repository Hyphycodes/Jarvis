import "server-only";

import { sourceDomainForItem } from "@/lib/items/considerationBrief";
import type { BrainContextPacket } from "@/lib/brain/types";
import type { IndexedItem } from "@/lib/index/types";

export type TasteConstitution = {
  identityFrame: string;
  coreLanes: string[];
  tastePrinciples: string[];
  positiveSignals: string[];
  negativeSignals: string[];
  spendPosture: string[];
  attentionPosture: string[];
  radarAdmissionRule: string;
};

export type TasteConstitutionScore = {
  score: number;
  positiveSignals: string[];
  negativeFlags: string[];
  laneMatches: string[];
};

const CONSTITUTION: TasteConstitution = {
  identityFrame:
    "Owner, creator, and operator building Hyphy through tech, cinematic production, ownership, health, faith, taste, precision, and control.",
  coreLanes: [
    "Health / body",
    "Skill / competence",
    "Taste / culture",
    "Ownership / land / real estate",
    "Creative / music / visuals",
    "Business / systems",
    "Social / meaningful rooms",
    "Peace / discipline",
  ],
  tastePrinciples: [
    "refined",
    "masculine",
    "cinematic",
    "grounded",
    "quiet luxury",
    "rugged but elegant",
    "timeless over trendy",
    "real over performative",
    "subtle flex over loud status",
    "useful over merely interesting",
    "calm over noisy",
    "layered over obvious",
  ],
  positiveSignals: [
    "low-lit refined dining",
    "steakhouse",
    "cigar lounge",
    "hotel lobby bar",
    "jazz room",
    "leather",
    "wool",
    "wood",
    "stone",
    "horseback riding",
    "golf",
    "basketball",
    "gun range",
    "outdoor skill",
    "menswear",
    "watches",
    "vintage seiko",
    "tailoring",
    "italian countryside",
    "land",
    "cabins",
    "homesteading",
    "ownership",
    "dj",
    "cinematic visuals",
    "soul",
    "jazz",
    "orchestral",
    "woodworking",
    "spanish",
    "camera",
    "real estate comps",
    "construction",
    "materials",
    "meaningful room",
  ],
  negativeSignals: [
    "loud influencer luxury",
    "fake exclusivity",
    "random networking mixer",
    "generic nightlife",
    "tiktok-coded",
    "bright hype rooftop",
    "corny masculine",
    "seo junk",
    "social snippet",
    "literal keyword match",
    "weak source lead",
    "closed event",
    "generic event spam",
    "luxury apartment",
    "random article",
  ],
  spendPosture: [
    "Free and low-cost moves are welcome when they sharpen the user.",
    "Paid moves need stronger fit.",
    "Expensive moves need taste, relationship, business, memory, skill, or rare-window value.",
    "Paid workday plans need extra justification.",
  ],
  attentionPosture: [
    "Protect focus.",
    "Do not add activity for its own sake.",
    "Nothing made the cut is a valid premium outcome.",
    "Recommendations must earn interruption.",
  ],
  radarAdmissionRule:
    "Do not show what is merely related. Only show what creates value now.",
};

const LANE_PATTERNS: Array<{
  lane: string;
  match: RegExp;
}> = [
  { lane: "Health / body", match: /basketball|gym|recovery|mobility|walk|trail|health|fitness|sunlight/i },
  { lane: "Skill / competence", match: /gun range|range session|spanish|woodworking|camera|framing|skill|practice|study|materials|construction/i },
  { lane: "Taste / culture", match: /menswear|watch|seiko|tailor|style|jazz|soul|dining|restaurant|cigar|lounge|hotel|gallery|culture/i },
  { lane: "Ownership / land / real estate", match: /land|real estate|property|cabin|homestead|comp review|ownership|deal/i },
  { lane: "Creative / music / visuals", match: /dj|crate|record|visual|cinematic|verse|hook|music|photo|camera|creative/i },
  { lane: "Business / systems", match: /business|system|product|marketing|outreach|investor|jarvis|ai/i },
  { lane: "Social / meaningful rooms", match: /coffee|dinner|cigar|room|invite|relationship|social|friend|network/i },
  { lane: "Peace / discipline", match: /quiet|discipline|recovery|reset|peace|low friction|calm|focus/i },
];

const POSITIVE_PATTERNS: Array<{ signal: string; match: RegExp }> = [
  { signal: "refined room", match: /steakhouse|cigar|hotel lobby|jazz|listening bar|refined|understated|low-lit/i },
  { signal: "grounded materials", match: /leather|wool|wood|stone|heritage|workwear|tailor/i },
  { signal: "physical competence", match: /basketball|golf|gun range|horseback|gym|outdoor|trail/i },
  { signal: "ownership lane", match: /land|real estate|property|cabin|homestead|comp review/i },
  { signal: "creative fuel", match: /dj|crate|music|camera|cinematic|visual|verse|hook/i },
  { signal: "skill rep", match: /spanish|woodworking|practice|study|materials|construction/i },
  { signal: "low-cost sharpener", match: /free|low-cost|low friction|walk|study|review|cleanup|practice/i },
];

const NEGATIVE_PATTERNS: Array<{ flag: string; match: RegExp }> = [
  { flag: "fake_luxury", match: /influencer luxury|fake exclusivity|luxury apartment|luxury living|houzz/i },
  { flag: "hype_noise", match: /tiktok|viral|hype|rooftop party|club night|bottle service/i },
  { flag: "corny", match: /alpha male|man cave|rugged maniac|manly men|sigma/i },
  { flag: "seo_junk", match: /best .* near me|top 10|coupon|directory|yellow pages|groupon/i },
  { flag: "social_noise", match: /instagram|facebook|view all \d+ comments|profile|hashtag/i },
  { flag: "too_literal", match: /rugged masculine chicago|quiet luxury chicago/i },
  { flag: "source_lead_only", match: /source lead|needs verification|watch for stronger evidence/i },
  { flag: "generic", match: /things to do|events near me|places near me|generic/i },
];

export function getTasteConstitution(): TasteConstitution {
  return CONSTITUTION;
}

export function scoreAgainstTasteConstitution(
  candidate: IndexedItem,
  context?: BrainContextPacket,
): TasteConstitutionScore {
  const text = candidateText(candidate);
  const positiveSignals = POSITIVE_PATTERNS
    .filter((entry) => entry.match.test(text))
    .map((entry) => entry.signal);
  const negativeFlags = getAntiLaneFlags(candidate);
  const laneMatches = LANE_PATTERNS
    .filter((entry) => entry.match.test(text))
    .map((entry) => entry.lane);

  const founderBoost =
    context?.founder.vibeKeywords.some((keyword) =>
      keyword && text.includes(keyword.toLowerCase()),
    ) ? 0.06 : 0;
  const avoidPenalty =
    context?.founder.avoidKeywords.some((keyword) =>
      keyword && text.includes(keyword.toLowerCase()),
    ) ? 0.1 : 0;

  const score = clamp01(
    0.46 +
      positiveSignals.length * 0.07 +
      laneMatches.length * 0.045 +
      founderBoost -
      negativeFlags.length * 0.12 -
      avoidPenalty,
  );

  return {
    score,
    positiveSignals: unique(positiveSignals),
    negativeFlags: unique(negativeFlags),
    laneMatches: unique(laneMatches),
  };
}

export function getAntiLaneFlags(candidate: IndexedItem): string[] {
  const text = candidateText(candidate);
  return unique(
    NEGATIVE_PATTERNS
      .filter((entry) => entry.match.test(text))
      .map((entry) => entry.flag),
  );
}

export function getPurposeLabel(
  candidate: IndexedItem,
  context?: BrainContextPacket,
): string {
  const score = scoreAgainstTasteConstitution(candidate, context);
  const primaryLane = score.laneMatches[0] ?? "";
  if (/Health/.test(primaryLane)) return "Health reset";
  if (/Skill/.test(primaryLane)) return "Skill rep";
  if (/Taste/.test(primaryLane)) return "Taste development";
  if (/Ownership/.test(primaryLane)) return "Ownership lane";
  if (/Creative/.test(primaryLane)) return "Creative fuel";
  if (/Business/.test(primaryLane)) return "Business leverage";
  if (/Social/.test(primaryLane)) return "Social room";
  if (/Peace/.test(primaryLane)) return "Peace";
  return "Useful move";
}

function candidateText(candidate: IndexedItem): string {
  const payload = isRecord(candidate.rawPayload) ? candidate.rawPayload : {};
  const briefing = candidate.briefing;
  return [
    candidate.title,
    candidate.subtitle,
    candidate.description,
    candidate.category,
    candidate.type,
    candidate.source,
    candidate.locationName,
    candidate.reasons.join(" "),
    candidate.tags.join(" "),
    sourceDomainForItem(candidate),
    briefing?.display_title,
    briefing?.display_category,
    briefing?.one_line,
    briefing?.jarvis_take,
    briefing?.why_it_matters,
    briefing?.evidence_summary,
    typeof payload.query === "string" ? payload.query : undefined,
    typeof payload.lane_id === "string" ? payload.lane_id : undefined,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
