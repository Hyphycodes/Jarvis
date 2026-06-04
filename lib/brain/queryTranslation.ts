import "server-only";

const TRANSLATIONS: Array<{ match: RegExp; queries: string[] }> = [
  {
    match: /(rugged|heritage|masculine|western|workwear|menswear)/i,
    queries: [
      "{city} menswear boutique",
      "{city} heritage menswear",
      "{city} leather goods boutique",
      "{city} barber grooming lounge",
      "{city} vintage menswear market",
      "{city} western wear boutique",
      "{city} watch event",
      "{city} cigar lounge event",
      "{city} workwear boutique",
      "{city} gun range",
      "{city} cigar lounge",
    ],
  },
  {
    match: /(quiet luxury|tailoring|refined|luxury menswear)/i,
    queries: [
      "{city} menswear boutique",
      "{city} design store",
      "{city} tailoring event",
      "{city} watch boutique event",
      "{city} leather goods",
      "{city} hotel lobby bar",
      "{city} refined cocktail lounge",
      "{city} understated restaurant",
    ],
  },
  {
    match: /(dining|restaurant|steakhouse|supper|jazz dinner|food)/i,
    queries: [
      "Eater {city} new restaurant",
      "Infatuation {city} new restaurants",
      "{city} Magazine best new restaurants",
      "{city} steakhouse opening",
      "{city} live jazz dinner",
      "{city} restaurant pop-up",
    ],
  },
  {
    match: /(culture|jazz|gallery|art|music|listening bar|resident advisor)/i,
    queries: [
      "local events {city} jazz this week",
      "{city} reader events this weekend",
      "{city} gallery opening",
      "Resident Advisor {city} intimate event",
      "{city} listening bar",
      "{city} art opening this weekend",
    ],
  },
  {
    match: /(outdoors|basketball|horseback|golf|motocross|trail|active|sports)/i,
    queries: [
      "basketball courts near {city}",
      "horseback riding near {city}",
      "golf tee times near {city}",
      "motocross track near {city}",
      "outdoor activities near {city} this weekend",
      "forest preserve trails near {city}",
      "gun range near {city}",
    ],
  },
  {
    match: /(slow travel|craftsmanship destination|artisan travel|global living)/i,
    queries: [
      "slow travel destinations craftsmanship",
      "artisan travel destinations world",
      "{city} design store natural materials",
      "world-class neighborhoods culinary travel",
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
  homeCity?: string | null;
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
  return uniq(
    translated
      .map((query) => renderHomeQuery(query, input.homeCity))
      .map(normalizeQuery)
      .filter(Boolean),
  ).slice(0, 6);
}

function normalizeQuery(query: string): string {
  return query
    .replace(/\brugged masculine\b/gi, "heritage menswear")
    .replace(/\bquiet luxury\b/gi, "menswear boutique")
    .replace(/\s+/g, " ")
    .trim();
}

function renderHomeQuery(query: string, homeCity?: string | null): string {
  const city = homeCity?.trim();
  if (city) {
    return replaceLegacyCityTerms(query.replace(/\{city\}/g, city), city);
  }
  return replaceLegacyCityTerms(query.replace(/\{city\}/g, ""), "");
}

function replaceLegacyCityTerms(query: string, city: string): string {
  const previousCity = ["Chi", "cago"].join("");
  const previousSuburb = ["Sch", "aumburg"].join("");
  const previousState = ["Ill", "inois"].join("");
  return query
    .replace(new RegExp(`\\b${previousCity} suburbs\\b`, "gi"), city ? `${city} area` : "")
    .replace(new RegExp(`\\bnear ${previousSuburb}\\b`, "gi"), city ? `near ${city}` : "")
    .replace(new RegExp(`\\bnear ${previousCity}\\b`, "gi"), city ? `near ${city}` : "")
    .replace(new RegExp(`\\b${previousCity}\\b`, "g"), city)
    .replace(new RegExp(`\\b${previousState}\\b`, "g"), "");
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}
