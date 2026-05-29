import "server-only";

const BASE = "https://api.elevenlabs.io/v1";
const TTS_MODEL = "eleven_turbo_v2_5";

function apiKey(): string {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error("ELEVENLABS_API_KEY not set");
  return k;
}

function voiceId(): string {
  return process.env.ELEVENLABS_VOICE_ID ?? "onwK4e9ZLuTAKqWW03F9";
}

export function hasElevenLabs(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

// ── Transcription (Scribe) ────────────────────────────────────────────────────

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", audioBlob, "audio.webm");
  form.append("model_id", "scribe_v1");

  const res = await fetch(`${BASE}/speech-to-text`, {
    method: "POST",
    headers: { xi_api_key: apiKey() },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs transcription failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { text?: string };
  const text = data.text?.trim() ?? "";
  if (!text) throw new Error("ElevenLabs returned empty transcription");
  return text;
}

// ── Text to speech ────────────────────────────────────────────────────────────

/** Strip markdown before speaking — no asterisks, headers, or bullet chars. */
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, "")       // headers
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1") // bold/italic
    .replace(/`{1,3}[^`]*`{1,3}/g, "") // code
    .replace(/^[-•*]\s+/gm, "")       // bullets
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/\n{2,}/g, " ")
    .trim();
}

export async function synthesizeSpeech(text: string): Promise<ArrayBuffer> {
  const cleaned = stripMarkdown(text);

  const res = await fetch(`${BASE}/text-to-speech/${voiceId()}`, {
    method: "POST",
    headers: {
      xi_api_key: apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: cleaned,
      model_id: TTS_MODEL,
      voice_settings: {
        stability: 0.55,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: false,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${body}`);
  }

  return res.arrayBuffer();
}
