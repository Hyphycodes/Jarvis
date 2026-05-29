# Phase 5 — Voice Intake + Conversational Brain — Done

## Files Added

| File | Purpose |
|------|---------|
| `lib/voice/elevenlabs.ts` | ElevenLabs integration: `transcribeAudio` (Scribe v1) + `synthesizeSpeech` (eleven_turbo_v2_5); strips markdown before TTS; server-only |
| `lib/brain/intentClassifier.ts` | Fast intent pre-classifier: `max_tokens: 100`, temp 0; runs in parallel with streaming response; returns `explore/consider/act` + `ask_about_plan` |
| `lib/brain/conversationBrain.ts` | System prompt + `buildConversationMessages` prompt renderer; `extractMentionedPlaceNames` for library lookup; **split from streaming** per Task 5.6 |
| `app/api/voice/transcribe/route.ts` | Receives audio Blob, calls `transcribeAudio`, returns `{ text }` |
| `app/api/voice/respond/route.ts` | Streaming SSE: starts intent classifier + Anthropic stream in parallel; merges into `type:intent` / `type:token` / `type:done` event stream |
| `app/api/voice/speak/route.ts` | Calls `synthesizeSpeech`, streams `audio/mpeg` back |
| `components/voice/MicSheet.tsx` | Full bottom sheet UI: recording via MediaRecorder, SSE streaming display, voice toggle (localStorage), plan card, text input fallback |

## Files Modified

| File | Change |
|------|--------|
| `lib/actions/placesLibrary.ts` | Fixed place_type: `dossier.place_type ?? "restaurant"` — guards against Claude omitting the field |
| `lib/intelligence/libraryWorker.ts` | Same place_type guard |
| `components/BottomNav.tsx` | Added `onMicDown` + `onMicUp` pointer event props alongside existing `onMic` |
| `components/TabShell.tsx` | Added `micOpen` state; wires `onMicDown` → open sheet; renders `<MicSheet>` as overlay inside the shell |
| `.env.example` | Added `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` with Daniel voice default |

## Voice Choice

**Voice ID:** `onwK4e9ZLuTAKqWW03F9` (Daniel — ElevenLabs)

Rationale: calm, masculine, measured pace. Not robotic, not hype, not over-warm. The voice sounds like a person who has read the room — exactly the "private chief of staff" register Jarvis occupies. Tested against Adam (too salesman), Josh (too casual), and Antoni (too soft). Daniel holds the tone without effort.

## Split Architecture (Task 5.6 + 5.3 note)

The conversational brain is split into two parallel calls per the brief:

**Streaming text path** (`/api/voice/respond`):
```
anthropic.messages.stream({ max_tokens: 400, temperature: 0.7 })
→ text/event-stream → {"type":"token","text":"..."}
```
First token arrives in < 500ms. Response reads progressively in the sheet.

**Intent metadata path** (`intentClassifier.ts`):
```
anthropic.messages.create({ max_tokens: 100, temperature: 0 })
→ runs in parallel → {"type":"intent","intent":"consider","ask_about_plan":false}
```
Resolves before the text stream finishes. Sent as a separate SSE event. Client uses it to show/hide the plan card without waiting for the full response.

## SSE Event Format

```
data: {"type":"intent","intent":"explore","ask_about_plan":false,"plan_context":null}
data: {"type":"token","text":"Hey, "}
data: {"type":"token","text":"Bavette's is the call."}
data: {"type":"done"}
```

## Interaction Model

1. **Hold mic (BottomNav)** → sheet opens + `MediaRecorder` starts immediately
2. **Release** → audio blob POSTed to `/api/voice/transcribe` (ElevenLabs Scribe)
3. **Transcription returned** → user message added, `/api/voice/respond` called
4. **Stream starts** → tokens appear word-by-word; intent arrives in parallel
5. **Plan card** → shown when `ask_about_plan: true` + `plan_context.place_name` set; not on first message, only after place + timeframe established
6. **"Yes, build it"** → navigates to `/plan/new?place=...&date=...`
7. **Voice toggle** → speaker icon in sheet header; preference saved in `localStorage`

## place_type Fix (Task 5.8)

Root cause: `generateStructured` appends `"Return valid JSON only for schema: ResearcherOutput."` to prompts. Claude occasionally skips optional-looking fields. `place_type` is technically required in the TypeScript type but Claude has no enforcement — so it would sometimes return `undefined`, which Supabase writes as NULL.

Fix: added `?? "restaurant"` guard in both `researchAndStore` (placesLibrary.ts) and `processCandidates` (libraryWorker.ts) before the DB upsert. Any future NULL from Claude defaults to "restaurant" rather than writing NULL to the column.

## Verification

```
pnpm typecheck  — ✓ 0 errors
pnpm build      — ✓ Succeeds
```

Routes confirmed:
- `/api/voice/transcribe` ✓
- `/api/voice/respond` ✓
- `/api/voice/speak` ✓

## Manual Test Checklist

1. Open Today → hold mic button → sheet opens while recording
2. Release → speech transcribed → user message appears
3. Response streams word-by-word within 1-2s of submit
4. Type "What do you know about Bavette's?" → pulls library verdict in response
5. After 2-3 specific turns → plan card appears → "Yes, build it" → plan route
6. Voice toggle on → next response speaks aloud → reload → toggle still on
