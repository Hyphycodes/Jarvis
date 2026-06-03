import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import {
  commitTasteSeedImport,
  dryRunTasteSeedImport,
} from "@/lib/tasteSeed/importer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let owner;
  try {
    owner = await requireOwner();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    markdown?: unknown;
    fileName?: unknown;
    dryRun?: unknown;
  };
  const markdown = typeof body.markdown === "string" ? body.markdown : "";
  if (!markdown.trim()) {
    return NextResponse.json({ ok: false, error: "Missing markdown." }, { status: 400 });
  }
  const fileName = typeof body.fileName === "string" ? body.fileName : "taste-seed.md";
  const dryRun = body.dryRun !== false;

  if (dryRun) {
    const result = dryRunTasteSeedImport({ markdown, fileName });
    return NextResponse.json({
      ok: true,
      mode: result.mode,
      fileName: result.fileName,
      provenance: result.provenance,
      summary: result.summary,
    });
  }

  const supabase = await getServerSupabase();
  const result = await commitTasteSeedImport({
    userId: owner.id,
    markdown,
    fileName,
    supabase,
  });
  return NextResponse.json({
    ok: true,
    mode: result.mode,
    fileName: result.fileName,
    provenance: result.provenance,
    summary: result.summary,
    traceId: result.traceId ?? null,
  });
}
