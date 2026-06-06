import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { ingestWardrobePhotos } from "@/lib/wardrobe/intake";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type IncomingImage = { base64?: string; image_base64?: string; media_type?: string; image_media_type?: string };

export async function POST(req: Request) {
  try {
    const owner = await requireOwner();
    const body = (await req.json().catch(() => ({}))) as {
      images?: IncomingImage[];
      image_base64?: string;
      image_media_type?: string;
      context?: string;
    };

    // Accept a batch (images[]) or a single legacy image.
    const raw: IncomingImage[] = Array.isArray(body.images) && body.images.length
      ? body.images
      : body.image_base64
        ? [{ image_base64: body.image_base64, image_media_type: body.image_media_type }]
        : [];

    const photos = raw
      .map((img) => ({
        base64: typeof (img.base64 ?? img.image_base64) === "string" ? (img.base64 ?? img.image_base64)! : "",
        mediaType: typeof (img.media_type ?? img.image_media_type) === "string"
          ? (img.media_type ?? img.image_media_type)
          : "image/jpeg",
      }))
      .filter((p) => p.base64);

    if (photos.length === 0) {
      return NextResponse.json({ ok: false, error: "No images" }, { status: 400 });
    }

    const summary = await ingestWardrobePhotos({
      userId: owner.id,
      photos,
      contextNote: typeof body.context === "string" ? body.context : undefined,
    });

    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Intake failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
