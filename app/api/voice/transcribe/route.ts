import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { transcribeAudio, hasElevenLabs } from "@/lib/voice/elevenlabs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    await requireOwner();

    if (!hasElevenLabs()) {
      return NextResponse.json(
        { ok: false, error: "Voice transcription not configured." },
        { status: 503 },
      );
    }

    const formData = await req.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json(
        { ok: false, error: "audio field is required (Blob)" },
        { status: 400 },
      );
    }

    const text = await transcribeAudio(audioFile);
    return NextResponse.json({ ok: true, text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    const status = /login|owner|auth/i.test(message) ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
