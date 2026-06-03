import type { Json } from "@/lib/types/database";

export const TASTE_SEED_SOURCE = "taste_seed_import";

export type TasteSeedProvenance = {
  source: typeof TASTE_SEED_SOURCE;
  source_file_name: string;
  imported_at: string;
  confidence: "owner_provided";
};

export type ParsedTasteSeed = {
  people: TasteSeedPerson[];
  places: TasteSeedPlace[];
  upcomingEvents: TasteSeedEvent[];
  tasteSignals: TasteSeedSignal[];
  negativeFilters: TasteSeedSignal[];
  discoverySources: TasteSeedSource[];
  notes: TasteSeedNote[];
  warnings: string[];
};

export type TasteSeedPerson = {
  key: string;
  name: string;
  category: string;
  role?: string | null;
  notes: string[];
  groupContext?: string | null;
  closenessScore: number;
  neighborhood?: string | null;
};

export type TasteSeedPlace = {
  key: string;
  name: string;
  location?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  notes: string[];
  useCases: string[];
  whyLiked: string[];
  signals: string[];
  wouldReturn?: string | null;
  priceNote?: string | null;
  guardrails: string[];
  tags: string[];
  qualityScore: number;
};

export type TasteSeedEvent = {
  key: string;
  title: string;
  dateText?: string | null;
  notes: string[];
  people: string[];
  suggestedAction?: string | null;
  ambiguousDate: boolean;
};

export type TasteSeedSignal = {
  key: string;
  trait: string;
  category: string;
  direction: "positive" | "negative";
  weight: number;
  confidence: number;
  metadata: Json;
};

export type TasteSeedSource = {
  key: string;
  name: string;
  sourceType: "publication" | "search_pattern" | "other";
  topics: string[];
  notes: string[];
  status: "testing" | "watching";
  trustScore: number;
  tasteFitScore: number;
};

export type TasteSeedNote = {
  key: string;
  content: string;
  kind: "context" | "relationship" | "decision_rule" | "place_history";
  tags: string[];
  confidence: number;
};

type HeadingBlock = {
  level: number;
  title: string;
  lines: string[];
};

const SECTION_TITLES = [
  "people / circle",
  "upcoming events",
  "places",
  "taste signals",
  "discovery sources to monitor",
  "notes for jarvis",
];

export function parseTasteSeedMarkdown(markdown: string): ParsedTasteSeed {
  const sections = splitSections(markdown);
  const peopleSection = sections.get("people / circle") ?? "";
  const eventsSection = sections.get("upcoming events") ?? "";
  const placesSection = sections.get("places") ?? "";
  const tasteSection = sections.get("taste signals") ?? "";
  const sourcesSection = sections.get("discovery sources to monitor") ?? "";
  const notesSection = sections.get("notes for jarvis") ?? "";
  const people = parsePeople(peopleSection);
  const places = parsePlaces(placesSection);
  const upcomingEvents = parseEvents(eventsSection, people.map((person) => person.name));
  const { tasteSignals, negativeFilters } = parseTasteSignals(tasteSection);
  const discoverySources = parseDiscoverySources(sourcesSection);
  const notes = uniqueByKey([
    ...parseNotes(notesSection),
    ...extractOperatingNotes(people, places, upcomingEvents, tasteSignals),
  ]);
  const warnings: string[] = [];
  if (!notesSection.trim()) {
    warnings.push("No NOTES FOR JARVIS section found; extracted explicit operating notes from other sections.");
  }
  return {
    people,
    places,
    upcomingEvents,
    tasteSignals,
    negativeFilters,
    discoverySources,
    notes,
    warnings,
  };
}

export function buildTasteSeedProvenance(input: {
  fileName?: string | null;
  importedAt?: string | Date | null;
} = {}): TasteSeedProvenance {
  const importedAt = input.importedAt
    ? new Date(input.importedAt).toISOString()
    : new Date().toISOString();
  return {
    source: TASTE_SEED_SOURCE,
    source_file_name: input.fileName || "taste-seed.md",
    imported_at: importedAt,
    confidence: "owner_provided",
  };
}

export function summarizeParsedTasteSeed(parsed: ParsedTasteSeed) {
  return {
    people: parsed.people.length,
    places: parsed.places.length,
    upcomingEvents: parsed.upcomingEvents.length,
    tasteSignals: parsed.tasteSignals.length,
    negativeFilters: parsed.negativeFilters.length,
    discoverySources: parsed.discoverySources.length,
    notes: parsed.notes.length,
    warnings: parsed.warnings,
  };
}

function splitSections(markdown: string): Map<string, string> {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of lines) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) {
      const title = normalizeHeading(match[1]);
      current = SECTION_TITLES.includes(title) ? title : null;
      if (current && !sections.has(current)) sections.set(current, []);
      continue;
    }
    if (current) sections.get(current)?.push(line);
  }
  return new Map(Array.from(sections.entries()).map(([key, value]) => [key, value.join("\n")]));
}

function splitHeadingBlocks(section: string): HeadingBlock[] {
  const blocks: HeadingBlock[] = [];
  let current: HeadingBlock | null = null;
  for (const line of section.split("\n")) {
    const heading = /^(#{3,4})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = { level: heading[1].length, title: heading[2].trim(), lines: [] };
      blocks.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return blocks;
}

function parsePeople(section: string): TasteSeedPerson[] {
  const people: TasteSeedPerson[] = [];
  for (const block of splitHeadingBlocks(section)) {
    const bullets = bulletLines(block.lines);
    const boldPeople = bullets
      .map((line) => parseBoldPersonBullet(line, block.title))
      .filter((person): person is TasteSeedPerson => Boolean(person));
    if (boldPeople.length > 0) {
      people.push(...boldPeople);
      continue;
    }
    if (isGroupHeading(block.title)) continue;
    const name = cleanTitle(block.title);
    people.push({
      key: slug(name),
      name,
      category: inferPersonCategory(block.title, bullets),
      role: null,
      notes: unique(bullets.map(stripMarkdown).filter(Boolean)),
      groupContext: null,
      closenessScore: inferCloseness(name, block.title, bullets),
      neighborhood: inferNeighborhood(`${block.title}\n${bullets.join("\n")}`),
    });
  }
  return uniqueByKey(people);
}

function parseBoldPersonBullet(line: string, groupTitle: string): TasteSeedPerson | null {
  const match = /^\s*\*\*(.+?)\*\*\s*(?:[—-]\s*)?(.*)$/.exec(line);
  if (!match) return null;
  const name = cleanTitle(match[1]);
  const detail = stripMarkdown(match[2] ?? "");
  return {
    key: slug(name),
    name,
    category: inferPersonCategory(groupTitle, [detail]),
    role: null,
    notes: unique([detail, stripMarkdown(groupTitle)].filter(Boolean)),
    groupContext: stripMarkdown(groupTitle),
    closenessScore: inferCloseness(name, groupTitle, [detail]),
    neighborhood: inferNeighborhood(`${groupTitle}\n${detail}`),
  };
}

function parseEvents(section: string, knownPeople: string[]): TasteSeedEvent[] {
  return splitHeadingBlocks(section)
    .map((block) => {
      const titleParts = splitDashTitle(block.title);
      const title = cleanTitle(titleParts.title);
      const dateText = titleParts.detail ?? null;
      const bullets = bulletLines(block.lines).map(stripMarkdown).filter(Boolean);
      const quoteNotes = block.lines
        .map((line) => line.trim())
        .filter((line) => line.startsWith(">"))
        .map((line) => stripMarkdown(line.replace(/^>\s*/, "")));
      const notes = unique([...bullets, ...quoteNotes]);
      return {
        key: slug(title),
        title,
        dateText,
        notes,
        people: extractKnownPeople(`${title}\n${notes.join("\n")}`, knownPeople),
        suggestedAction: notes.find((note) => /planning|gifting|flagging|worth/i.test(note)) ?? null,
        ambiguousDate: !dateText || /~|around|same|cluster/i.test(dateText),
      };
    })
    .filter((event) => event.title.length > 0);
}

function parsePlaces(section: string): TasteSeedPlace[] {
  return splitHeadingBlocks(section)
    .map((block) => {
      const titleParts = splitDashTitle(block.title);
      const name = cleanTitle(titleParts.title);
      const bullets = bulletLines(block.lines).map(stripMarkdown).filter(Boolean);
      const labeled = extractLabeledBullets(block.lines);
      const allText = `${block.title}\n${bullets.join("\n")}`;
      const neighborhood = inferPlaceNeighborhood(titleParts.detail ?? "", allText);
      const city = inferCity(titleParts.detail ?? "", allText);
      const guardrails = labeled["What not to misunderstand"] ?? [];
      return {
        key: slug(name),
        name,
        location: titleParts.detail ?? null,
        city,
        neighborhood,
        notes: bullets,
        useCases: labeled["Use case"] ?? [],
        whyLiked: labeled["Why liked"] ?? [],
        signals: labeled.Signal ?? [],
        wouldReturn: (labeled["Would return"] ?? [])[0] ?? null,
        priceNote: inferPriceNote(allText),
        guardrails,
        tags: inferPlaceTags(allText, titleParts.detail ?? ""),
        qualityScore: inferPlaceQuality(allText),
      };
    })
    .filter((place) => place.name.length > 0);
}

function parseTasteSignals(section: string): {
  tasteSignals: TasteSeedSignal[];
  negativeFilters: TasteSeedSignal[];
} {
  const tasteSignals: TasteSeedSignal[] = [];
  const negativeFilters: TasteSeedSignal[] = [];
  for (const block of splitHeadingBlocks(section)) {
    const category = cleanTitle(block.title);
    const bullets = bulletLines(block.lines).map(stripMarkdown).filter(Boolean);
    if (/negative filters/i.test(category)) {
      for (const bullet of bullets) {
        for (const trait of splitNegativeTrait(bullet)) {
          negativeFilters.push(signal(trait, "negative filters", "negative", 1.1, 0.92));
        }
      }
      continue;
    }
    for (const bullet of bullets) {
      tasteSignals.push(signal(bullet, category, "positive", signalWeight(category, bullet), 0.9));
    }
  }
  return {
    tasteSignals: uniqueByKey(tasteSignals),
    negativeFilters: uniqueByKey(negativeFilters),
  };
}

function parseDiscoverySources(section: string): TasteSeedSource[] {
  return bulletLines(section.split("\n"))
    .map((line) => {
      const match = /^\s*\*\*(.+?)\*\*\s*(?:[—-]\s*)?(.*)$/.exec(line);
      const name = cleanTitle(match?.[1] ?? line.replace(/^-\s*/, ""));
      const detail = stripMarkdown(match?.[2] ?? "");
      const all = `${name} ${detail}`;
      const status: TasteSeedSource["status"] = /acted|uses|legitimate/i.test(all) ? "watching" : "testing";
      return {
        key: `taste_seed_source:${slug(name)}`,
        name,
        sourceType: inferSourceType(all),
        topics: inferSourceTopics(all),
        notes: unique([detail].filter(Boolean)),
        status,
        trustScore: /acted|legitimate/i.test(all) ? 0.68 : 0.55,
        tasteFitScore: /acted|legitimate/i.test(all) ? 0.72 : 0.58,
      };
    })
    .filter((source) => source.name.length > 0);
}

function parseNotes(section: string): TasteSeedNote[] {
  return bulletLines(section.split("\n"))
    .map(stripMarkdown)
    .filter(Boolean)
    .map((content) => note(content, inferNoteKind(content), inferNoteTags(content)));
}

function extractOperatingNotes(
  people: TasteSeedPerson[],
  places: TasteSeedPlace[],
  events: TasteSeedEvent[],
  signals: TasteSeedSignal[],
): TasteSeedNote[] {
  const notes: TasteSeedNote[] = [];
  for (const person of people) {
    for (const line of person.notes) {
      if (/spelled|family-level|warm context|moves around|comfortable|Logan Square/i.test(line)) {
        notes.push(note(`${person.name}: ${line}`, "relationship", ["circle", "spelling"]));
      }
    }
  }
  for (const place of places) {
    for (const line of [...place.guardrails, ...place.signals]) {
      notes.push(note(`${place.name}: ${line}`, "place_history", ["place", "taste"]));
    }
  }
  for (const event of events) {
    if (event.suggestedAction) {
      notes.push(note(`${event.title}: ${event.suggestedAction}`, "context", ["planning", "circle"]));
    }
  }
  for (const signalEntry of signals) {
    if (/Sunday reset|Gold Coast|cigar with dad|short context|rotates away/i.test(signalEntry.trait)) {
      notes.push(note(signalEntry.trait, "context", inferNoteTags(signalEntry.trait)));
    }
  }
  return notes;
}

function signal(
  trait: string,
  category: string,
  direction: "positive" | "negative",
  weight: number,
  confidence: number,
): TasteSeedSignal {
  const cleaned = cleanSentence(trait);
  return {
    key: `${direction}:${slug(category)}:${slug(cleaned)}`,
    trait: cleaned,
    category,
    direction,
    weight,
    confidence,
    metadata: {
      category,
      extracted_from: "taste_seed_markdown",
    },
  };
}

function note(content: string, kind: TasteSeedNote["kind"], tags: string[]): TasteSeedNote {
  const cleaned = cleanSentence(content);
  return {
    key: `${kind}:${slug(cleaned)}`,
    content: cleaned,
    kind,
    tags: unique(tags),
    confidence: 0.9,
  };
}

function splitSectionsFallback(value: string): string[] {
  return value.split(/\s*[,;]\s*/).map((part) => part.trim()).filter(Boolean);
}

function splitNegativeTrait(value: string): string[] {
  return splitSectionsFallback(value)
    .flatMap((part) => part.split(/\s+\/\s+|\s+or\s+/i))
    .map(cleanSentence)
    .filter(Boolean);
}

function bulletLines(lines: string[]): string[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").trim());
}

function extractLabeledBullets(lines: string[]): Record<string, string[]> {
  const labels: Record<string, string[]> = {};
  for (const raw of bulletLines(lines)) {
    const match = /^\*\*(.+?):\*\*\s*(.+)$/.exec(raw);
    if (!match) continue;
    const label = cleanTitle(match[1]);
    labels[label] = [...(labels[label] ?? []), stripMarkdown(match[2])];
  }
  return labels;
}

function splitDashTitle(value: string): { title: string; detail?: string } {
  const parts = value.split(/\s+[—-]\s+/);
  return {
    title: parts[0]?.trim() ?? value.trim(),
    detail: parts.length > 1 ? parts.slice(1).join(" - ").trim() : undefined,
  };
}

function inferPersonCategory(title: string, notes: string[]): string {
  const text = `${title}\n${notes.join("\n")}`;
  if (/cousin|Tío|Jerry’s cousins/i.test(text)) return "family";
  if (/family|brother|wife|extended/i.test(text)) return "family";
  if (/friend|neighbor/i.test(text)) return "friend";
  return "circle";
}

function inferCloseness(name: string, title: string, notes: string[]): number {
  const text = `${name}\n${title}\n${notes.join("\n")}`;
  if (/best friend|family-level|main casual activity partner|since age 4/i.test(text)) return 0.95;
  if (/close friend|family|warm context|cousin/i.test(text)) return 0.82;
  return 0.68;
}

function inferNeighborhood(text: string): string | null {
  const match = /(Logan Square|Bolingbrook|Gold Coast|Lincoln Park|Fulton Market|Worth|Oak Brook)/i.exec(text);
  return match?.[1] ?? null;
}

function inferPlaceNeighborhood(location: string, text: string): string | null {
  const match = /(Logan Square|Gold Coast|Lincoln Park|Fulton Market|Riverwalk|Worth|Oak Brook|Bolingbrook)/i.exec(`${location}\n${text}`);
  return match?.[1] ?? null;
}

function inferCity(location: string, text: string): string | null {
  const combined = `${location}\n${text}`;
  if (/Chicago|Gold Coast|Lincoln Park|Fulton Market|Riverwalk/i.test(combined)) return "Chicago";
  if (/Bolingbrook/i.test(combined)) return "Bolingbrook";
  if (/Oak Brook/i.test(combined)) return "Oak Brook";
  if (/Worth/i.test(combined)) return "Worth";
  return null;
}

function inferPriceNote(text: string): string | null {
  const match = /(\$\d+[^\n]*|accessible price point|current budget|prices|not worth the money)/i.exec(text);
  return match?.[0] ?? null;
}

function inferPlaceTags(text: string, location: string): string[] {
  const tags: string[] = [];
  const combined = `${text}\n${location}`.toLowerCase();
  const pairs: Array<[RegExp, string]> = [
    [/steak|ribeye|carnitas|food|restaurant|brunch|lunch|dinner/, "food"],
    [/cigar/, "cigar"],
    [/outdoor|park|patio|walk|bench|pickleball|basketball|soccer/, "outdoor"],
    [/date night|1-on-1|sophia/, "one_on_one"],
    [/family|group|crew|tailgate/, "group"],
    [/gold coast|elevated|service|atmosphere|design/, "elevated_atmosphere"],
    [/mexican/, "mexican"],
    [/japanese|nobu/, "japanese"],
    [/mediterranean|middle eastern|greek/, "mediterranean"],
    [/brazilian/, "brazilian"],
    [/activity|sports|pickleball|gym/, "activity"],
    [/reliable fallback/, "fallback"],
    [/discovery|on the radar|hasn’t been yet/i, "needs_enrichment"],
  ];
  for (const [pattern, tag] of pairs) {
    if (pattern.test(combined)) tags.push(tag);
  }
  return unique(tags);
}

function inferPlaceQuality(text: string): number {
  if (/favorite|great service|quality food|would return:\s*yes|legitimate discovery source/i.test(text)) return 0.78;
  if (/solid|reliable|worth revisiting|would return/i.test(text)) return 0.66;
  if (/not a regular|not actively seeking|not a priority/i.test(text)) return 0.52;
  if (/hasn’t been yet|on the radar/i.test(text)) return 0.5;
  return 0.6;
}

function signalWeight(category: string, trait: string): number {
  if (/negative/i.test(category)) return 1.1;
  if (/discovery|social|hosting|neighborhood/i.test(category)) return 1;
  if (/food|movement|cigars/i.test(category)) return 0.95;
  if (/curious|not committed|not really/i.test(trait)) return 0.75;
  return 0.9;
}

function inferSourceType(text: string): TasteSeedSource["sourceType"] {
  if (/blog|Instagram|publication/i.test(text)) return "publication";
  if (/walk|discover|word of mouth|circle|proximity|drift/i.test(text)) return "search_pattern";
  return "other";
}

function inferSourceTopics(text: string): string[] {
  const topics = ["taste_seed"];
  if (/Chicago/i.test(text)) topics.push("chicago");
  if (/walk|drift|proximity/i.test(text)) topics.push("neighborhood_drift");
  if (/word of mouth|circle/i.test(text)) topics.push("circle");
  if (/blog|Instagram/i.test(text)) topics.push("source_monitoring");
  return unique(topics);
}

function inferNoteKind(content: string): TasteSeedNote["kind"] {
  if (/family|friend|circle|dad|spelled|spelling|partner|crew/i.test(content)) return "relationship";
  if (/avoid|do not|should not|not to misunderstand/i.test(content)) return "decision_rule";
  if (/place|destination|drift|walk|bench|neighborhood|return|orbit/i.test(content)) return "place_history";
  return "context";
}

function inferNoteTags(content: string): string[] {
  const tags = ["taste_seed"];
  if (/family|friend|circle|dad|partner|crew/i.test(content)) tags.push("circle");
  if (/spelled|spelling/i.test(content)) tags.push("spelling");
  if (/place|drift|destination|walk|bench|return|orbit/i.test(content)) tags.push("place");
  if (/Sunday|reset|planning|birthday|event/i.test(content)) tags.push("planning");
  if (/avoid|not to misunderstand|clubby|try-hard/i.test(content)) tags.push("guardrail");
  return unique(tags);
}

function extractKnownPeople(text: string, names: string[]): string[] {
  return names.filter((name) => text.includes(name));
}

function isGroupHeading(title: string): boolean {
  return /extended family|cousins/i.test(title);
}

function normalizeHeading(value: string): string {
  return cleanTitle(value).toLowerCase();
}

function cleanTitle(value: string): string {
  return stripMarkdown(value).replace(/\s+/g, " ").trim();
}

function cleanSentence(value: string): string {
  return stripMarkdown(value).replace(/\s+/g, " ").trim();
}

function stripMarkdown(value: string): string {
  return value
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^>\s*/, "")
    .trim();
}

export function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function uniqueByKey<T extends { key: string }>(values: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const value of values) {
    if (!byKey.has(value.key)) byKey.set(value.key, value);
  }
  return Array.from(byKey.values());
}
