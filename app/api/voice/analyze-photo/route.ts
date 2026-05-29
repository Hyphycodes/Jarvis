import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    await requireOwner();

    const body = (await req.json().catch(() => ({}))) as {
      image_base64?: string;
      image_media_type?: string;
    };

    const imageBase64 = typeof body.image_base64 === "string" ? body.image_base64 : "";
    const mediaType = typeof body.image_media_type === "string"
      ? body.image_media_type
      : "image/jpeg";

    if (!imageBase64) {
      return NextResponse.json({ ok: false, error: "No image provided" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // Fallback: return generic context without analysis
      return NextResponse.json({
        ok: true,
        description: "A photo",
        context: "User attached a photo.",
      });
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Describe this image concisely in 1-2 sentences. If it's a flyer or menu, extract key details (name, date, event type). If it's a place, describe what you see.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mediaType};base64,${imageBase64}`,
                  detail: "low",
                },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({
        ok: true,
        description: "A photo",
        context: "User attached a photo.",
      });
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const description = data.choices?.[0]?.message?.content?.trim() ?? "A photo";

    return NextResponse.json({
      ok: true,
      description,
      context: `User attached photo: ${description}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Photo analysis failed";
    const status = /login|owner|auth/i.test(message) ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
