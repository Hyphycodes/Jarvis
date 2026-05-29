/**
 * POST /api/voice/realtime
 *
 * Creates an OpenAI Realtime API ephemeral session token.
 * The client uses this token to connect directly to OpenAI's WebSocket,
 * keeping the API key server-side while enabling real-time transcription.
 */
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    await requireOwner();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY not configured" },
        { status: 500 },
      );
    }

    const res = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview",
        modalities: ["audio", "text"],
        input_audio_format: "pcm16",
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[voice/realtime] session creation failed", res.status, body);
      return NextResponse.json(
        { ok: false, error: "Failed to create Realtime session" },
        { status: 502 },
      );
    }

    const session = (await res.json()) as {
      id: string;
      client_secret: { value: string; expires_at: number };
    };

    return NextResponse.json({
      ok: true,
      session_id: session.id,
      client_secret: session.client_secret.value,
      expires_at: session.client_secret.expires_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Realtime session failed";
    const status = /login|owner|auth/i.test(message) ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
