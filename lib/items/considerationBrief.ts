import "server-only";

import type { ItemBriefing } from "@/lib/brain/briefingTypes";
import { purposeLabelForItem } from "@/lib/brain/purposeLabels";
import type { IndexedItem } from "@/lib/index/types";

export type ConsiderationVerdict = "move" | "hold" | "watch" | "pass" | "plan";
export type ConsiderationTone = "positive" | "neutral" | "caution" | "negative";
export type ConsiderationPrimaryAction =
  | "save"
  | "hold"
  | "plan"
  | "upcoming"
  | "pass"
  | "archive";
export type BriefDisplayDepth = "minimal" | "compact" | "rich";

export type ConsiderationBriefView = {
  id: string;
  title: string;
  subtitle?: string;
  verdict: ConsiderationVerdict;
  verdictLabel: string;
  verdictTone: ConsiderationTone;
  categoryLabel: string;
  typeLabel?: string;
  oneLine: string;
  jarvisTake: string;
  bestMoveTitle: string;
  bestMoveBody: string;
  primaryAction: ConsiderationPrimaryAction;
  purposeLabel: string;
  briefDisplayDepth: BriefDisplayDepth;
  facts: Array<{ label: string; value: string; icon?: string }>;
  indicators: Array<{
    key:
      | "taste_fit"
      | "trajectory_fit"
      | "novelty_gap"
      | "timing_fit"
      | "effort"
      | "spend"
      | "evidence_quality"
      | "confidence";
    label: string;
    valueLabel: string;
    score?: number;
    body?: string;
  }>;
  whyItMatters: Array<{ title: string; body: string; icon?: string }>;
  practicalFit: Array<{ label: string; value: string; detail?: string; icon?: string }>;
  location?: {
    label?: string;
    address?: string;
    lat?: number;
    lng?: number;
    neighborhood?: string;
    city?: string;
    mapsUrl?: string;
  };
  media: {
    heroUrl?: string;
    gallery: Array<{ url: string; alt?: string }>;
    placeholderKind: "event" | "place" | "product" | "idea" | "activity" | "general";
  };
  valueSignal?: {
    label: string;
    score?: number;
    body: string;
  };
  sourceEvidence?: {
    domain?: string;
    title?: string;
    summary?: string;
    url?: string;
    qualityLabel?: string;
  };
  cleanTags: string[];
  debug: {
    itemId: string;
    rawStatus?: string;
    rawDestination?: string;
    lane?: string;
    query?: string;
    score?: number;
    createdAt?: string;
    updatedAt?: string;
  };
};

export function buildConsiderationBrief(item: IndexedItem): ConsiderationBriefView {
  const payload = asRecord(item.rawPayload);
  const briefing = item.briefing ?? fallbackBriefing(item, payload);
  const verdict = inferVerdict(item, briefing);
  const sourceEvidence = readSourceEvidence(item, payload, briefing);
  const location = readLocation(item, payload);
  const media = readMedia(item, payload);
  const indicators = buildIndicators(item, briefing, sourceEvidence);
  const whyItMatters = buildWhyItMatters(item, briefing, indicators);
  const practicalFit = buildPracticalFit(item, briefing, location);
  const bestMove = bestMoveCopy(verdict, briefing);
  const valueSignal = buildValueSignal(item, briefing, indicators);
  const purposeLabel = stringValue(payload.purpose_label) ?? purposeLabelForItem(item);
  const briefDisplayDepth =
    readRadarDisplayDepth(payload) ?? displayDepthFor(item, briefing, verdict);
  const facts = buildFacts(item, briefing, location, sourceEvidence, purposeLabel);

  return {
    id: item.id,
    title: cleanText(briefing.display_title || item.title || "Untitled"),
    subtitle: cleanOptional(briefing.why_now ?? item.subtitle),
    verdict,
    verdictLabel: verdict.toUpperCase(),
    verdictTone: toneForVerdict(verdict),
    categoryLabel: cleanLabel(briefing.display_category || item.category || item.type),
    typeLabel: item.type ? cleanLabel(item.type) : undefined,
    oneLine: cleanText(briefing.one_line),
    jarvisTake: cleanText(briefing.jarvis_take),
    bestMoveTitle: bestMove.title,
    bestMoveBody: bestMove.body,
    primaryAction: primaryActionForVerdict(verdict, item),
    purposeLabel,
    briefDisplayDepth,
    facts,
    indicators,
    whyItMatters,
    practicalFit,
    location,
    media,
    valueSignal,
    sourceEvidence,
    cleanTags: cleanTags(briefing.cleaned_tags.length > 0 ? briefing.cleaned_tags : item.tags),
    debug: {
      itemId: item.id,
      rawStatus: item.status,
      rawDestination: item.destination,
      lane: stringValue(payload.lane_id),
      query: stringValue(payload.query),
      score: item.score,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    },
  };
}

export function heroImageForItem(item: IndexedItem): string | undefined {
  return readMedia(item, asRecord(item.rawPayload)).heroUrl;
}

export function sourceDomainForItem(item: IndexedItem): string | undefined {
  const payload = asRecord(item.rawPayload);
  const url =
    item.url ??
    stringValue(payload.source_url) ??
    stringValue(payload.url) ??
    stringValue(payload.link);
  return safeDomain(url);
}

function inferVerdict(item: IndexedItem, briefing: ItemBriefing): ConsiderationVerdict {
  if (item.status === "passed" || item.status === "archived") return "pass";
  if (item.status === "planned" || briefing.best_next_action === "plan") return "plan";
  switch (briefing.best_next_action) {
    case "save":
      return item.destination === "upcoming" ? "plan" : "move";
    case "hold":
      return "hold";
    case "research":
    case "watch":
      return "watch";
    case "pass":
    case "ignore":
      return "pass";
  }
}

function toneForVerdict(verdict: ConsiderationVerdict): ConsiderationTone {
  switch (verdict) {
    case "move":
    case "plan":
      return "positive";
    case "hold":
      return "neutral";
    case "watch":
      return "caution";
    case "pass":
      return "negative";
  }
}

function primaryActionForVerdict(
  verdict: ConsiderationVerdict,
  item: IndexedItem,
): ConsiderationPrimaryAction {
  if (item.status === "archived") return "archive";
  switch (verdict) {
    case "plan":
      return "plan";
    case "move":
      return item.startsAt ? "upcoming" : "save";
    case "hold":
    case "watch":
      return "hold";
    case "pass":
      return "pass";
  }
}

function bestMoveCopy(
  verdict: ConsiderationVerdict,
  briefing: ItemBriefing,
): { title: string; body: string } {
  const take = cleanText(briefing.jarvis_take);
  switch (verdict) {
    case "move":
      return {
        title: "Save for comparison.",
        body: take || "Strong fit, low friction. Keep it close enough to act on.",
      };
    case "plan":
      return {
        title: "Worth planning.",
        body: take || "The signal is strong enough to turn into an actual move.",
      };
    case "hold":
      return {
        title: "Keep in Holding.",
        body: take || "Good signal, not urgent. Compare it against stronger options before moving.",
      };
    case "watch":
      return {
        title: "Watch for stronger evidence.",
        body: take || "Good idea, needs a better source before it deserves action.",
      };
    case "pass":
      return {
        title: "Pass.",
        body: take || "Not decision-ready yet. Let it leave the board.",
      };
  }
}

function buildFacts(
  item: IndexedItem,
  briefing: ItemBriefing,
  location: ConsiderationBriefView["location"],
  sourceEvidence: ConsiderationBriefView["sourceEvidence"],
  purposeLabel: string,
): ConsiderationBriefView["facts"] {
  const facts: ConsiderationBriefView["facts"] = [
    { label: "Purpose", value: purposeLabel, icon: "target" },
    { label: "Category", value: cleanLabel(briefing.display_category || item.category || item.type), icon: "category" },
  ];
  const time = formatWindow(item.startsAt, item.endsAt) ?? formatDate(item.expiresAt);
  if (time) facts.push({ label: "Window", value: time, icon: "calendar" });
  const place = location?.neighborhood ?? location?.city ?? location?.label;
  if (place) facts.push({ label: "Location", value: place, icon: "pin" });
  facts.push({ label: "Effort", value: cleanLabel(briefing.effort_level), icon: "effort" });
  facts.push({ label: "Spend", value: spendLabel(briefing.spending_posture), icon: "spend" });
  facts.push({ label: "Confidence", value: cleanLabel(briefing.confidence_label), icon: "confidence" });
  if (facts.length < 5 && sourceEvidence?.domain) {
    facts.push({ label: "Source", value: sourceEvidence.domain, icon: "source" });
  }
  return facts.slice(0, 5);
}

function displayDepthFor(
  item: IndexedItem,
  briefing: ItemBriefing,
  verdict: ConsiderationVerdict,
): BriefDisplayDepth {
  if (
    verdict === "watch" ||
    verdict === "pass" ||
    briefing.quality_flags.some((flag) =>
      ["weak_evidence", "needs_verification", "source_lead_only", "no_current_value"].includes(flag),
    ) ||
    briefing.confidence < 0.55
  ) {
    return "minimal";
  }
  if (
    verdict === "hold" ||
    briefing.confidence < 0.72 ||
    !item.imageUrl && !item.locationName && !item.startsAt
  ) {
    return "compact";
  }
  return "rich";
}

function readRadarDisplayDepth(payload: Record<string, unknown>): BriefDisplayDepth | undefined {
  const decision = asRecord(payload.radar_decision);
  const depth = stringValue(decision.display_depth);
  return depth === "minimal" || depth === "compact" || depth === "rich"
    ? depth
    : undefined;
}

function buildIndicators(
  item: IndexedItem,
  briefing: ItemBriefing,
  sourceEvidence: ConsiderationBriefView["sourceEvidence"],
): ConsiderationBriefView["indicators"] {
  const confidence = clamp01(briefing.confidence || item.score || 0.5);
  const evidenceScore = evidenceScoreFor(briefing, sourceEvidence);
  const timing = timingScoreFor(item, briefing);
  const novelty = noveltyScoreFor(item);
  return [
    {
      key: "taste_fit",
      label: "Taste Fit",
      valueLabel: confidence >= 0.74 ? "Strong fit" : confidence >= 0.55 ? "Good alignment" : "Light signal",
      score: confidence,
      body: "How closely this lines up with the current taste profile.",
    },
    {
      key: "trajectory_fit",
      label: "Trajectory Fit",
      valueLabel: hasTrajectoryTag(item) ? "Supports direction" : "Steady interest",
      score: hasTrajectoryTag(item) ? 0.76 : 0.58,
      body: "Whether this supports a bigger direction, not just a quick click.",
    },
    {
      key: "novelty_gap",
      label: "Novelty",
      valueLabel: novelty >= 0.72 ? "Fresh lane" : novelty >= 0.5 ? "Somewhat unique" : "Familiar",
      score: novelty,
      body: "How much new signal it adds compared with the usual lanes.",
    },
    {
      key: "timing_fit",
      label: "Timing Fit",
      valueLabel: timing >= 0.72 ? "Good window" : timing >= 0.5 ? "No rush" : "Wrong timing",
      score: timing,
      body: "Whether the timing makes this easier to act on now.",
    },
    {
      key: "evidence_quality",
      label: "Evidence Quality",
      valueLabel: evidenceScore >= 0.72 ? "Clean source" : evidenceScore >= 0.5 ? "Needs context" : "Thin evidence",
      score: evidenceScore,
      body: "How much the source supports a real decision.",
    },
    {
      key: "confidence",
      label: "Confidence",
      valueLabel: cleanLabel(briefing.confidence_label),
      score: confidence,
    },
  ];
}

function buildWhyItMatters(
  item: IndexedItem,
  briefing: ItemBriefing,
  indicators: ConsiderationBriefView["indicators"],
): ConsiderationBriefView["whyItMatters"] {
  const reasons: ConsiderationBriefView["whyItMatters"] = [];
  reasons.push({
    title: "Fits your taste.",
    body: cleanText(briefing.why_it_matters),
    icon: "taste",
  });
  const trajectory = indicators.find((i) => i.key === "trajectory_fit");
  if (trajectory) {
    reasons.push({
      title: trajectory.valueLabel === "Supports direction" ? "Supports the direction." : "On a steady trajectory.",
      body: trajectory.body ?? "It has enough alignment to keep in view.",
      icon: "trajectory",
    });
  }
  const timing = indicators.find((i) => i.key === "timing_fit");
  if (timing) {
    reasons.push({
      title: timing.valueLabel === "Wrong timing" ? "Timing is the constraint." : "Timing is flexible.",
      body: cleanOptional(briefing.why_now) ?? "Not urgent. Worth considering, but nothing breaks if you wait.",
      icon: "timing",
    });
  }
  if (item.type === "creative" || item.type === "recommendation" || item.type === "culture") {
    reasons.push({
      title: "Opens a lane.",
      body: "Quiet upside: a useful reference point, even if it is not an immediate move.",
      icon: "novelty",
    });
  }
  return reasons.slice(0, 4);
}

function buildPracticalFit(
  item: IndexedItem,
  briefing: ItemBriefing,
  location: ConsiderationBriefView["location"],
): ConsiderationBriefView["practicalFit"] {
  const rows: ConsiderationBriefView["practicalFit"] = [];
  const window = formatWindow(item.startsAt, item.endsAt) ?? cleanOptional(briefing.why_now);
  if (window) rows.push({ label: "Best window", value: window, icon: "calendar" });
  if (location?.neighborhood || location?.city) {
    rows.push({
      label: "Area",
      value: [location.neighborhood, location.city].filter(Boolean).join(", "),
      detail: location.address,
      icon: "pin",
    });
  }
  rows.push({ label: "Effort", value: cleanLabel(briefing.effort_level), icon: "effort" });
  rows.push({ label: "Spend", value: spendLabel(briefing.spending_posture), icon: "spend" });
  if (item.expiresAt) rows.push({ label: "Expires", value: formatDate(item.expiresAt) ?? "Not confirmed", icon: "clock" });
  return rows.slice(0, 5);
}

function buildValueSignal(
  item: IndexedItem,
  briefing: ItemBriefing,
  indicators: ConsiderationBriefView["indicators"],
): ConsiderationBriefView["valueSignal"] | undefined {
  const score = clamp01(
    indicators.slice(0, 4).reduce((sum, indicator) => sum + (indicator.score ?? 0.5), 0) / 4,
  );
  if (score < 0.45 && briefing.confidence < 0.5) return undefined;
  const label =
    item.category === "opportunity" || item.type === "real_estate"
      ? "Leverage signal"
      : item.type === "health"
        ? "Lifestyle signal"
        : item.type === "creative"
          ? "Creative signal"
          : "Value signal";
  return {
    label,
    score: Math.round(score * 100) / 10,
    body:
      score >= 0.7
        ? "Strong fit, useful timing, and enough upside to keep close."
        : "Quiet upside. Good enough to track, not strong enough to force.",
  };
}

function readLocation(
  item: IndexedItem,
  payload: Record<string, unknown>,
): ConsiderationBriefView["location"] | undefined {
  const nested = asRecord(payload.location);
  const label =
    item.locationName ??
    stringValue(nested.label) ??
    stringValue(nested.name) ??
    stringValue(payload.venue_name);
  const address =
    item.address ??
    stringValue(nested.address) ??
    stringValue(payload.address) ??
    stringValue(payload.formatted_address);
  const lat = item.lat ?? numberValue(nested.lat) ?? numberValue(nested.latitude);
  const lng = item.lng ?? numberValue(nested.lng) ?? numberValue(nested.longitude);
  const city =
    stringValue(nested.city) ??
    stringValue(payload.city) ??
    cityFromAddress(address);
  const neighborhood =
    stringValue(nested.neighborhood) ??
    stringValue(payload.neighborhood);

  if (!label && !address && lat == null && lng == null) return undefined;
  return {
    label,
    address,
    lat,
    lng,
    city,
    neighborhood,
    mapsUrl: mapsUrl({ label, address, lat, lng }),
  };
}

function readMedia(
  item: IndexedItem,
  payload: Record<string, unknown>,
): ConsiderationBriefView["media"] {
  const briefing = asRecord(payload.briefing);
  const media = Array.isArray(payload.media) ? payload.media : [];
  const rawImages = Array.isArray(payload.images) ? payload.images : [];
  const rawPayload = asRecord(payload.raw_payload);
  const nestedImages = Array.isArray(rawPayload.images) ? rawPayload.images : [];
  const nestedPhotos = Array.isArray(rawPayload.photos) ? rawPayload.photos : [];
  const gallery = [
    item.imageUrl,
    stringValue(briefing.hero_image_url),
    stringValue(payload.image_url),
    stringValue(payload.hero_image_url),
    firstMediaUrl(media),
    firstImageUrl(rawImages),
    firstImageUrl(nestedImages),
    firstImageUrl(nestedPhotos),
    stringValue(rawPayload.image_url),
    stringValue(rawPayload.photo_url),
    stringValue(rawPayload.thumbnail),
    stringValue(payload.thumbnail),
  ]
    .filter((url): url is string => Boolean(url))
    .filter((url, index, list) => list.indexOf(url) === index)
    .map((url) => ({ url, alt: item.title }));

  return {
    heroUrl: gallery[0]?.url,
    gallery,
    placeholderKind: placeholderKind(item),
  };
}

function readSourceEvidence(
  item: IndexedItem,
  payload: Record<string, unknown>,
  briefing: ItemBriefing,
): ConsiderationBriefView["sourceEvidence"] | undefined {
  const url =
    item.url ??
    stringValue(payload.source_url) ??
    stringValue(payload.url) ??
    stringValue(payload.link);
  const title =
    stringValue(payload.source_title) ??
    stringValue(payload.title) ??
    stringValue(payload.source_name);
  const domain = safeDomain(url);
  if (!url && !title && !briefing.evidence_summary) return undefined;
  return {
    domain,
    title,
    summary: cleanText(briefing.evidence_summary),
    url,
    qualityLabel: evidenceQualityLabel(briefing),
  };
}

function fallbackBriefing(
  item: IndexedItem,
  payload: Record<string, unknown>,
): ItemBriefing {
  const confidence = clamp01(item.score ?? 0.5);
  const sourceTitle = stringValue(payload.source_title);
  return {
    display_title: cleanText(item.title || sourceTitle || "Untitled"),
    display_category: cleanLabel(item.category ?? item.type ?? "Item"),
    one_line:
      cleanOptional(item.description ?? item.subtitle) ??
      "Not decision-ready yet. Useful enough to inspect, not enough to force.",
    jarvis_take:
      cleanOptional(item.reasons[0]) ??
      (item.destination === "holding"
        ? "Good signal, not urgent."
        : "Good idea, needs a better source."),
    why_it_matters:
      cleanOptional(item.reasons[1]) ??
      "It has enough signal to consider, but the stronger decision frame is still forming.",
    why_now: item.startsAt ? formatWindow(item.startsAt, item.endsAt) : undefined,
    best_next_action: item.destination === "holding" ? "hold" : "research",
    confidence,
    confidence_label: confidence >= 0.74 ? "high" : confidence >= 0.5 ? "medium" : "low",
    effort_level: item.tags.includes("high-effort") ? "high" : "low",
    spending_posture:
      item.tags.includes("paid") || item.tags.includes("ticketed")
        ? "paid"
        : "unknown",
    suggested_destination: item.destination === "holding" ? "holding" : "discovered",
    quality_flags: item.url || item.locationName ? [] : ["needs_verification"],
    evidence_summary: sourceTitle
      ? `Original source: ${cleanText(sourceTitle)}.`
      : "No edited source summary yet.",
    cleaned_tags: cleanTags(item.tags),
  };
}

function evidenceScoreFor(
  briefing: ItemBriefing,
  sourceEvidence: ConsiderationBriefView["sourceEvidence"],
): number {
  if (briefing.quality_flags.includes("weak_evidence")) return 0.38;
  if (briefing.quality_flags.includes("needs_verification")) return 0.48;
  if (sourceEvidence?.url && sourceEvidence.title) return 0.78;
  if (sourceEvidence?.url) return 0.64;
  return 0.5;
}

function timingScoreFor(item: IndexedItem, briefing: ItemBriefing): number {
  if (briefing.quality_flags.includes("poor_timing")) return 0.35;
  if (!item.startsAt) return 0.55;
  const start = new Date(item.startsAt).getTime();
  if (Number.isNaN(start)) return 0.55;
  const days = (start - Date.now()) / (24 * 60 * 60 * 1000);
  if (days >= 0 && days <= 10) return 0.78;
  if (days > 10) return 0.62;
  return 0.3;
}

function noveltyScoreFor(item: IndexedItem): number {
  if (item.tags.some((tag) => /wildcard|adjacent|new|emerging|creative/.test(tag))) return 0.76;
  if (item.source === "research") return 0.62;
  return 0.5;
}

function hasTrajectoryTag(item: IndexedItem): boolean {
  return item.tags.some((tag) =>
    /north|career|business|real_estate|land|creative|health|discipline|faith/.test(tag),
  );
}

function placeholderKind(
  item: IndexedItem,
): ConsiderationBriefView["media"]["placeholderKind"] {
  if (item.type === "event" || item.category === "events" || item.category === "music") return "event";
  if (item.type === "restaurant" || item.type === "place" || item.category === "dining") return "place";
  if (item.type === "product" || item.type === "style" || item.category === "shopping") return "product";
  if (item.type === "health" || /golf|horse|motocross|outdoor|sport/.test(item.tags.join(" "))) return "activity";
  if (item.type === "creative" || item.type === "recommendation" || item.type === "real_estate") return "idea";
  return "general";
}

function evidenceQualityLabel(briefing: ItemBriefing): string {
  if (briefing.quality_flags.includes("weak_evidence")) return "Needs verification";
  if (briefing.quality_flags.includes("needs_verification")) return "Check source";
  if (briefing.confidence >= 0.72) return "Clean source";
  return "Useful source";
}

function firstMediaUrl(media: unknown[]): string | undefined {
  for (const entry of media) {
    if (typeof entry === "string") return entry;
    const record = asRecord(entry);
    const url = stringValue(record.url) ?? stringValue(record.image_url) ?? stringValue(record.src);
    if (url) return url;
  }
  return undefined;
}

function firstImageUrl(images: unknown[]): string | undefined {
  for (const entry of images) {
    if (typeof entry === "string") return entry;
    const record = asRecord(entry);
    const url = stringValue(record.url) ?? stringValue(record.src);
    if (url) return url;
  }
  return undefined;
}

function mapsUrl(input: {
  label?: string;
  address?: string;
  lat?: number;
  lng?: number;
}): string | undefined {
  if (input.lat != null && input.lng != null) {
    return `https://maps.apple.com/?ll=${input.lat},${input.lng}&q=${encodeURIComponent(input.label ?? "Location")}`;
  }
  const query = input.address ?? input.label;
  return query ? `https://maps.apple.com/?q=${encodeURIComponent(query)}` : undefined;
}

function formatWindow(startIso?: string, endIso?: string): string | undefined {
  const start = parseDate(startIso);
  if (!start) return undefined;
  const end = parseDate(endIso);
  const startLabel = start.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (!end) return startLabel;
  const endLabel = end.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${startLabel} - ${endLabel}`;
}

function formatDate(iso?: string): string | undefined {
  const date = parseDate(iso);
  if (!date) return undefined;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parseDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function spendLabel(value: ItemBriefing["spending_posture"]): string {
  switch (value) {
    case "free":
      return "Free";
    case "low":
      return "$";
    case "paid":
      return "$$";
    case "high":
      return "$$$";
    case "unknown":
      return "Not confirmed";
  }
}

function cleanTags(tags: string[]): string[] {
  return tags
    .filter((tag) => !isInternalTag(tag))
    .map((tag) => cleanLabel(tag))
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index)
    .slice(0, 10);
}

function isInternalTag(tag: string): boolean {
  return (
    tag.startsWith("seed:") ||
    tag.startsWith("lane:") ||
    tag.startsWith("mode:") ||
    tag.includes(":") ||
    tag === "strategist-lane" ||
    tag === "local-radar" ||
    tag === "web-result" ||
    tag === "article-lead" ||
    tag === "qa-fixture"
  );
}

function cleanLabel(value: string): string {
  return cleanText(value)
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function cleanOptional(value?: string | null): string | undefined {
  const cleaned = value ? cleanText(value) : "";
  return cleaned || undefined;
}

function cleanText(value: string): string {
  return value
    .replace(/Strategist lane:\s*[^.]+\.?/gi, "")
    .replace(/Query:\s*"[^"]+"\s*/gi, "")
    .replace(/\b(seed|lane|local-radar):[\w:-]+\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cityFromAddress(address?: string): string | undefined {
  if (!address) return undefined;
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : undefined;
}

function safeDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
