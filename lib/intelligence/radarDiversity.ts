import "server-only";

import type { RadarDiversityReport, RadarItem } from "@/lib/intelligence/types";

export function analyzeRadarDiversity(items: RadarItem[]): RadarDiversityReport {
  const groups: Record<string, number> = {};
  for (const item of items) {
    groups[item.diversityGroup] = (groups[item.diversityGroup] ?? 0) + 1;
  }
  return {
    groups,
    repeatedGroups: Object.entries(groups)
      .filter(([, count]) => count > 1)
      .map(([group]) => group),
    selectedGroups: Object.keys(groups),
  };
}

export function selectDiverseRadarSet(
  candidates: RadarItem[],
  minCount = 5,
  maxCount = 10,
): RadarItem[] {
  const sorted = [...candidates]
    .filter((item) => item.decision.admission === "radar")
    .sort((a, b) => b.score - a.score);
  const selected: RadarItem[] = [];
  const groupCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();

  for (const candidate of sorted) {
    if (selected.length >= maxCount) break;
    if ((groupCounts.get(candidate.diversityGroup) ?? 0) > 0) continue;
    selected.push(candidate);
    groupCounts.set(candidate.diversityGroup, 1);
    categoryCounts.set(candidate.category, (categoryCounts.get(candidate.category) ?? 0) + 1);
  }

  for (const candidate of sorted) {
    if (selected.length >= maxCount) break;
    if (selected.some((item) => item.item.id === candidate.item.id)) continue;
    const groupCount = groupCounts.get(candidate.diversityGroup) ?? 0;
    const categoryCount = categoryCounts.get(candidate.category) ?? 0;
    const canRepeat = selected.length < minCount ? groupCount < 2 : groupCount < 1;
    if (!canRepeat || categoryCount >= 3) continue;
    selected.push(candidate);
    groupCounts.set(candidate.diversityGroup, groupCount + 1);
    categoryCounts.set(candidate.category, categoryCount + 1);
  }

  return selected;
}

