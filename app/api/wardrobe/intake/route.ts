import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { ingestWardrobePhoto } from "@/lib/wardrobe/intake";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const owner = await requireOwner();
    const body = (await req.json().catch(() => ({}))) as {
      image_base64?: string;
      image_media_type?: string;
    };

    const imageBase64 =
      typeof body.image_base64 === "string" ? body.image_base64 : "";
    const mediaType =
      typeof body.image_media_type === "string" ? body.image_media_type : "image/jpeg";

    if (!imageBase64) {
      return NextResponse.json({ ok: false, error: "No image" }, { status: 400 });
    }

    const result = await ingestWardrobePhoto({
      userId: owner.id,
      imageBase64,
      mediaType,
    });

    if (!result.stored) {
      return NextResponse.json({ ok: true, stored: false, reason: result.reason });
    }

    return NextResponse.json({
      ok: true,
      stored: true,
      category: result.category,
      description: result.description,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Intake failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
