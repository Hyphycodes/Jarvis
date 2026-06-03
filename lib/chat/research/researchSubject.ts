import "server-only";

import { researchAndStore } from "@/lib/actions/placesLibrary";
import type {
  EntityCandidate,
  ImageAnalysisResult,
  ResearchSubjectResult,
} from "@/lib/chat/types";

export async function researchSubject(input: {
  analysis?: ImageAnalysisResult;
  entities?: EntityCandidate[];
  sourceUrl?: string | null;
  snippet?: string | null;
}): Promise<ResearchSubjectResult | null> {
  const subject = pickSubject(input.analysis, input.entities);
  if (!subject.name) return null;

  if (subject.type === "place") {
    try {
      const researched = await researchAndStore(subject.name, {
        discoveredUrl: input.sourceUrl ?? input.analysis?.extracted.website_or_url,
        snippet: input.snippet ?? input.analysis?.extracted.raw_text,
      });
      return {
        subjectName: researched.dossier.canonical_name,
        subjectType: "place",
        summary: summarizePlace(researched),
        sourceUrl:
          researched.dossier.sources_cited[0]?.url ??
          input.sourceUrl ??
          input.analysis?.extracted.website_or_url ??
          null,
        location: researched.dossier.neighborhood,
        priceInfo: researched.dossier.price_level,
        isCurrent: null,
        confidence: researched.dossier.confidence,
        raw: {
          library_id: researched.libraryId,
          dossier: researched.dossier,
          verdict: researched.verdict,
        },
      };
    } catch (error) {
      console.warn("[chat.researchSubject] place research failed", {
        subject: subject.name,
        error,
      });
    }
  }

  const ex = input.analysis?.extracted ?? {};
  return {
    subjectName: subject.name,
    subjectType: subject.type,
    summary: [
      ex.event_date ? `Date: ${ex.event_date}` : null,
      ex.location ? `Location: ${ex.location}` : null,
      ex.price_info ? `Price: ${ex.price_info}` : null,
      ex.vibe_description ?? ex.caption_text ?? ex.raw_text ?? "Recognized from the submitted image.",
    ].filter(Boolean).join(" | "),
    sourceUrl: ex.website_or_url ?? input.sourceUrl ?? null,
    location: ex.location ?? null,
    priceInfo: ex.price_info ?? null,
    isCurrent: Boolean(ex.event_date) || null,
    confidence: confidenceNumber(input.analysis?.confidence ?? "low"),
    raw: input.analysis ? { analysis: input.analysis } : {},
  };
}

function pickSubject(
  analysis?: ImageAnalysisResult,
  entities: EntityCandidate[] = [],
): { name: string | null; type: ResearchSubjectResult["subjectType"] } {
  const primary = entities.find((e) => e.role === "primary_subject");
  if (primary) return { name: primary.name, type: primary.type };

  const ex = analysis?.extracted;
  if (ex?.venue_name) return { name: ex.venue_name, type: "place" };
  if (ex?.event_name) return { name: ex.event_name, type: "event" };
  if (ex?.account_name) return { name: ex.account_name, type: "source" };
  if (ex?.product_or_brand) return { name: ex.product_or_brand, type: "brand" };
  return { name: null, type: "unknown" };
}

function summarizePlace(input: Awaited<ReturnType<typeof researchAndStore>>) {
  const dossier = input.dossier;
  return [
    dossier.canonical_name,
    dossier.neighborhood,
    dossier.cuisine_or_focus && dossier.cuisine_or_focus !== "unknown"
      ? dossier.cuisine_or_focus
      : null,
    input.verdict.verdict,
  ].filter(Boolean).join(" | ");
}

function confidenceNumber(value: ImageAnalysisResult["confidence"]) {
  if (value === "high") return 0.85;
  if (value === "medium") return 0.62;
  return 0.35;
}
