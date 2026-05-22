# Briefings

Jarvis stores machine reasoning for the brain, but shows owner-facing briefings
in Radar, Today, and item detail.

## Role

`lib/brain/briefingEditor.ts` runs after Curator and Critic during
`POST /api/radar/refresh`. It converts raw source evidence, scored candidate
data, and curation judgment into concise display copy. It never writes directly
to the database; `runRadarCuration()` validates the result and applies it.

The Briefing Editor is capped at 12 candidates per refresh and reuses a fresh
briefing when the source fingerprint has not changed.

## Payload Shape

Briefings live inside `surfaced_items.payload.briefing`:

```json
{
  "display_title": "Chicago Heritage Menswear Lead",
  "display_category": "Style",
  "one_line": "A useful lead, but not urgent enough for active Radar.",
  "jarvis_take": "Good signal, weak evidence. Hold it until the source is cleaner.",
  "why_it_matters": "It aligns with the current style lane without forcing a buy.",
  "why_now": "Worth checking while the lane is active.",
  "best_next_action": "hold",
  "confidence": 0.62,
  "confidence_label": "medium",
  "effort_level": "low",
  "spending_posture": "unknown",
  "suggested_destination": "holding",
  "quality_flags": ["weak_evidence"],
  "evidence_summary": "Source evidence from the original article.",
  "cleaned_tags": ["style", "menswear"]
}
```

`payload.briefing_meta` stores the source fingerprint, generation timestamp, and
fallback reason when deterministic copy was used.

## Quality Flags

Supported flags:

- `seo_junk`
- `instagram_noise`
- `too_literal`
- `weak_evidence`
- `generic`
- `poor_timing`
- `too_expensive`
- `too_far`
- `not_actionable`
- `needs_verification`

Major flags keep an item out of Active Radar. Medium-signal items can still go
to Holding when they are useful but not decision-ready.

## Fallback

When Anthropic is missing or fails, Jarvis builds a deterministic briefing from
existing item fields. The fallback strips raw queries, lane ids, seed tags, and
obvious internal labels. It marks `payload.briefing_meta.fallback_used=true`.

Item pages never call Anthropic on load. If an item has no briefing, the page
shows deterministic fallback copy and the owner can explicitly call
`POST /api/items/[id]/refresh-briefing` with the Refresh briefing action.

## Display Policy

Primary UI may show:

- clean category
- display title
- one-line briefing
- Jarvis Take
- why it matters / why now
- practical fit
- source evidence summary

Primary UI must not show:

- raw queries
- strategist lane ids
- seed tags
- raw source payloads
- raw Claude JSON

Debug metadata can remain in a collapsed or low-priority section.
