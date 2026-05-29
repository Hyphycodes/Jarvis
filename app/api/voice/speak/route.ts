import { requireOwner } from "@/lib/auth";
import { synthesizeSpeech, hasElevenLabs } from "@/lib/voice/elevenlabs";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    await requireOwner();

    if (!hasElevenLabs()) {
      return NextResponse.json(
        { ok: false, error: "Voice synthesis not configured." },
        { status: 503 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { text?: string };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json(
        { ok: false, error: "text is required" },
        { status: 400 },
      );
    }

    const audioBuffer = await synthesizeSpeech(text);

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Speech synthesis failed";
    const status = /login|owner|auth/i.test(message) ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
