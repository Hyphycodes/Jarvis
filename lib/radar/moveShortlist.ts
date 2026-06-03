import type { RadarItem } from "@/lib/intelligence/types";

export function shortlistRadarMoves(
  items: RadarItem[],
  limit: number,
): RadarItem[] {
  const bestByLane = new Map<string, RadarItem>();
  for (const item of items) {
    const lane = laneKey(item);
    const current = bestByLane.get(lane);
    if (!current || fitScore(item) > fitScore(current)) {
      bestByLane.set(lane, item);
    }
  }
  return Array.from(bestByLane.values())
    .sort((a, b) => fitScore(b) - fitScore(a))
    .slice(0, Math.max(0, limit));
}

export function laneKey(item: RadarItem): string {
  const blob = `${item.category} ${item.vibe} ${item.item.type} ${item.item.tags.join(" ")}`.toLowerCase();
  if (/dining|restaurant|food|wine|lounge|cigar/.test(blob)) return "food_dining";
  if (/event|music|jazz|gallery|culture|studio/.test(blob)) return "culture_creative";
  if (/gym|sport|pickleball|boxing|horse|outdoor|trail|park/.test(blob)) return "active_social";
  if (/family|birthday|community|relationship/.test(blob)) return "family_social";
  if (/real estate|ownership|business|money|room/.test(blob)) return "business_room";
  if (/after work|reset|recovery|health/.test(blob)) return "after_work_reset";
  return "weekend_move";
}

function fitScore(item: RadarItem): number {
  const score = item.score * 0.36;
  const taste = item.scoreBreakdown.tasteFit * 0.2;
  const timing = item.scoreBreakdown.timingFit * 0.14;
  const evidence = item.evidence.quality * 0.12;
  const usefulness = item.scoreBreakdown.usefulness * 0.1;
  const novelty = item.scoreBreakdown.novelty * 0.08;
  const frictionPenalty = Math.min(0.2, item.missingInfo.length * 0.04);
  return score + taste + timing + evidence + usefulness + novelty - frictionPenalty;
}
