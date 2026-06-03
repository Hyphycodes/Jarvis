export type LibraryQualityTier = "A" | "B" | "C" | "muted" | "rejected";

export function qualityTierFromScore(score?: number | null): LibraryQualityTier {
  if (typeof score !== "number") return "C";
  if (score >= 0.75) return "A";
  if (score >= 0.58) return "B";
  if (score >= 0.35) return "C";
  return "rejected";
}
