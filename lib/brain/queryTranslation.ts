import "server-only";

const TRANSLATIONS: Array<{ match: RegExp; queries: string[] }> = [
  {
    match: /(rugged|heritage|masculine|western|workwear|menswear)/i,
    queries: [
      "Chicago menswear boutique",
      "Chicago heritage menswear",
      "Chicago leather goods boutique",
      "Chicago barber grooming lounge",
      "Chicago vintage menswear market",
      "Chicago western wear boutique",
      "Chicago watch event",
      "Chicago cigar lounge event",
      "Chicago workwear boutique",
      "Chicago gun range",
      "Chicago cigar lounge",
    ],
  },
  {
    match: /(quiet luxury|tailoring|refined|luxury menswear)/i,
    queries: [
      "Chicago menswear boutique",
      "Chicago design store",
      "Chicago tailoring event",
      "Chicago watch boutique event",
      "Chicago leather goods",
      "Chicago hotel lobby bar",
      "Chicago refined cocktail lounge",
      "Chicago understated restaurant",
    ],
  },
  {
    match: /(dining|restaurant|steakhouse|supper|jazz dinner|food)/i,
    queries: [
      "Eater Chicago new restaurant",
      "Infatuation Chicago new restaurants",
      "Chicago Magazine best new restaurants",
      "Chicago steakhouse opening",
      "Chicago live jazz dinner",
      "Chicago restaurant pop-up",
    ],
  },
  {
    match: /(culture|jazz|gallery|art|music|listening bar|resident advisor)/i,
    queries: [
      "Do312 Chicago jazz this week",
      "Chicago Reader events this weekend",
      "Choose Chicago gallery opening",
      "Resident Advisor Chicago intimate event",
      "Chicago listening bar",
      "Chicago art opening this weekend",
    ],
  },
  {
    match: /(outdoors|basketball|horseback|golf|motocross|trail|active|sports)/i,
    queries: [
      "basketball courts near Schaumburg",
      "horseback riding near Chicago",
      "golf tee times near Chicago suburbs",
      "motocross track Illinois",
      "outdoor activities near Chicago this weekend",
      "forest preserve trails near Schaumburg",
      "gun range near Schaumburg",
    ],
  },
  {
    match: /(italian countryside|italy|linen|natural materials|italian design)/i,
    queries: [
      "Chicago Italian market",
      "Chicago design store natural materials",
      "Chicago linen menswear",
      "Italian design Chicago event",
    ],
  },
  {
    match: /(land|homestead|cabin|timber|woodworking|rural)/i,
    queries: [
      "Wisconsin land auction",
      "Midwest timber framing workshop",
      "Illinois woodworking class",
      "Michigan cabin land",
    ],
  },
];

export function translateQueryIdeas(input: {
  queries: string[];
  laneTitle?: string;
  interestArea?: string;
  subinterests?: string[];
}): string[] {
  const blob = [
    input.laneTitle,
    input.interestArea,
    ...(input.subinterests ?? []),
    ...input.queries,
  ]
    .filter(Boolean)
    .join(" ");
  const replacements = TRANSLATIONS.find((entry) => entry.match.test(blob));
  const translated = replacements?.queries ?? input.queries;
  return uniq(translated.map(normalizeQuery).filter(Boolean)).slice(0, 6);
}

function normalizeQuery(query: string): string {
  return query
    .replace(/\brugged masculine\b/gi, "heritage menswear")
    .replace(/\bquiet luxury\b/gi, "menswear boutique")
    .replace(/\s+/g, " ")
    .trim();
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}
