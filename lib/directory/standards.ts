import type { QualityGate } from "@/lib/directory/types";

export const TASTE_CONSTITUTION = [
  "Surface fewer, better things.",
  "Specific beats generic.",
  "Calm, cinematic, and intentional beats loud or needy.",
  "Reality matters: a beautiful idea that is annoying tonight should lose.",
  "Memory compounds behavior but does not become a junk drawer.",
];

export const ANTI_GENERIC_RULES = [
  "Do not recommend because something is merely popular.",
  "Do not invent fake-personal details.",
  "Do not fill empty states with lifestyle fiction.",
  "Do not route weak recommendations just because data exists.",
];

export const QUALITY_GATES: QualityGate[] = [
  { id: "relevance", name: "Relevance Gate", failureBehavior: "hide" },
  { id: "reality", name: "Reality Gate", failureBehavior: "downgrade" },
  { id: "taste", name: "Taste Gate", failureBehavior: "reject" },
  { id: "atmosphere", name: "Atmosphere Gate", failureBehavior: "downgrade" },
  { id: "timing", name: "Timing Gate", failureBehavior: "route_lower" },
  { id: "routing", name: "Routing Gate", failureBehavior: "hide" },
  { id: "memory", name: "Memory Gate", failureBehavior: "route_lower" },
  { id: "director", name: "Director Gate", failureBehavior: "reject" },
];
