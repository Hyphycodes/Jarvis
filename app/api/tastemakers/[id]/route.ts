import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await requireOwner();
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const supabase = await getServerSupabase();
    const { error } = await supabase
      .from("tastemakers")
      .update({
        name: typeof body.name === "string" ? body.name.trim() : undefined,
        role: typeof body.role === "string" ? body.role : null,
        notes: typeof body.notes === "string" ? body.notes : null,
        instagram_handle: typeof body.instagram_handle === "string" ? body.instagram_handle : null,
        website_url: typeof body.website_url === "string" ? body.website_url : null,
        newsletter_url: typeof body.newsletter_url === "string" ? body.newsletter_url : null,
        ra_url: typeof body.ra_url === "string" ? body.ra_url : null,
        soundcloud_url: typeof body.soundcloud_url === "string" ? body.soundcloud_url : null,
        bandcamp_url: typeof body.bandcamp_url === "string" ? body.bandcamp_url : null,
        linktree_url: typeof body.linktree_url === "string" ? body.linktree_url : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", owner.id);

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    const status = /login|owner|auth/i.test(message) ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await requireOwner();
    const { id } = await params;

    const supabase = await getServerSupabase();
    const { error } = await supabase
      .from("tastemakers")
      .delete()
      .eq("id", id)
      .eq("user_id", owner.id);

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    const status = /login|owner|auth/i.test(message) ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
