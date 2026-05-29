# Phase 8 — Input Surface Overhaul

## What was added

### 8.1 — GPT-4o Realtime WebSocket integration
- `app/api/voice/realtime/route.ts`: POST endpoint that creates an OpenAI Realtime ephemeral session token. The client uses this token to connect directly to OpenAI's WebSocket, keeping the API key server-side. Returns `client_secret`, `session_id`, `expires_at`.
- `lib/voice/useRealtimeVoice.ts`: Client-side hook. `start()` creates the session, opens a WebSocket to `wss://api.openai.com/v1/realtime`, captures mic via `getUserMedia`, converts to PCM16 at 24kHz using an inline AudioWorklet processor, and streams audio chunks. Transcript deltas call `onTranscript(text, false)`; final transcript calls `onTranscript(text, true)`. Always captures a fallback MediaRecorder blob in parallel — if the WebSocket fails at any point, `transcribeAudio` runs on the blob and returns result silently. No raw errors shown.

### 8.2 — ElevenLabs Scribe kept as fallback
- `lib/voice/elevenlabs.ts` unchanged — `transcribeAudio` stays as the fallback target.
- `app/api/voice/transcribe/route.ts` unchanged — fallback route preserved.

### 8.3 — MicSheet rebuilt
- `components/voice/MicSheet.tsx`: Complete rebuild. Key changes:
  - **Toggle mic** (not hold): tap once to start, tap again to stop and send. Mic button pulses with CSS animation + orange glow ring while active.
  - **Quick reply chips**: rendered below each Jarvis message. Tapping one sends immediately.
  - **Attachment tray** always visible below messages: 📍 Place (inline search → `/api/places/search`), 🔗 Link (paste URL → `/api/voice/fetch-link`), 📷 Photo (file picker → `/api/voice/analyze-photo`). Attachment context injected silently into the message payload.
  - **Attachment preview**: small pill above input row showing attached label + dismiss button.
  - **Session persistence**: on close, saves to `sessionStorage` with timestamp. On open, restores if within 30 minutes.
  - **Context awareness**: calls `buildSheetContext()` on each send; result passed as `sheet_context` to `/api/voice/respond`.
  - **Hold-to-open**: `startListening` prop triggers `rtStart()` immediately when sheet opens.
  - **Haptics**: `navigator.vibrate(10)` on recording start, `[10, 50, 10]` on send.
  - **Voice toggle**: persisted to `localStorage` as before.

### 8.4 — Context awareness
- `lib/voice/buildSheetContext.ts`: Pure function. Takes `currentRoute` (from `usePathname()`), optional `visibleItem`, optional `tonightEvents`. Returns a 1-2 sentence context string injected silently as a system message prefix in `/api/voice/respond`.
- `/api/voice/respond/route.ts`: Accepts `sheet_context` in body. Prepends it to `CONVERSATION_SYSTEM_PROMPT` when present. Not exposed in conversation history.

### 8.5 — Session persistence
- `MicSheet.tsx`: On close, saves `{ messages, savedAt }` to `sessionStorage`. On open, restores if age < 30 minutes; clears and starts fresh otherwise.

### 8.6 — Drop It In removed
- `app/(tabs)/TodaySigned.tsx`: `DropItIn` component and all its types removed entirely. No dead code left. The sheet is now the single input surface.

### 8.7 — Intent classifier chips
- `lib/brain/intentClassifier.ts`: `IntentResult` now includes `chips: string[]`. System prompt updated to generate 2-3 short follow-up chips per intent. Fallback returns `["Tell me more", "What else?"]`.
- `app/api/voice/respond/route.ts`: Chips included in the `type:intent` SSE event alongside the existing fields.
- `MicSheet.tsx`: Intent chips rendered below each Jarvis message as pill buttons.

## New attachment API routes
- `app/api/voice/fetch-link/route.ts`: Fetches URL, strips HTML, summarizes with Claude (max 200 words), returns `{ title, summary, context }`.
- `app/api/voice/analyze-photo/route.ts`: Sends base64 image to GPT-4o Vision, returns a natural language description as `context`.

## Files changed

| File | Action |
|------|--------|
| `lib/voice/useRealtimeVoice.ts` | Created |
| `lib/voice/buildSheetContext.ts` | Created |
| `app/api/voice/realtime/route.ts` | Created |
| `app/api/voice/fetch-link/route.ts` | Created |
| `app/api/voice/analyze-photo/route.ts` | Created |
| `components/voice/MicSheet.tsx` | Rebuilt |
| `lib/brain/intentClassifier.ts` | Modified (chips) |
| `app/api/voice/respond/route.ts` | Modified (sheet_context, chips SSE) |
| `app/(tabs)/TodaySigned.tsx` | Modified (Drop It In removed) |
| `PHASE_8_DONE.md` | Created |

## Decisions & deviations

- **WebSocket relay vs ephemeral session**: Vercel serverless functions don't support raw WebSocket upgrades (`Upgrade: websocket`). Implemented OpenAI's ephemeral session token pattern instead — server creates the session (keeping API key safe), client connects directly. This is OpenAI's recommended browser pattern and has equivalent security.
- **Google Places search for attachment tray**: The tray's Place option calls `/api/places/search?q=`. That route doesn't exist yet; it will need to be created in a future pass using the existing `googlePlaces.ts` adapter. The UI renders correctly but will return empty results until wired.
- **`conversationBrain.ts` not changed**: `ConversationOutput` type doesn't exist there — the chips flow entirely through the `IntentResult` type in `intentClassifier.ts` and the SSE event in the respond route.
- **Hold-to-open from parent**: The `startListening` prop triggers voice start when the sheet opens mid-animation, matching the "Jarvis is listening before the sheet finishes animating" requirement.
