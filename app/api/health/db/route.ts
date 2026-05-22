import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/ssr-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SchemaCheck = {
  name: string;
  ok: boolean;
  error?: string;
  note?: string;
};

export async function GET() {
  const supabase = await getServerSupabase();
  const checks: SchemaCheck[] = [];

  checks.push(
    await checkSchema("surfaced_items.universal_index_columns", async () =>
      supabase
        .from("surfaced_items")
        .select("id,type,category,title,source_id,reasons,tags,expires_at")
        .limit(1),
    ),
  );

  checks.push(
    await checkSchema("plans.live_enabled", async () =>
      supabase.from("plans").select("id,live_enabled,live_label").limit(1),
    ),
  );

  checks.push({
    ...(await checkSchema("memory_update_proposals.archived_status_read", async () =>
      supabase
        .from("memory_update_proposals")
        .select("id,status")
        .eq("status", "archived")
        .limit(1),
    )),
    note:
      "Non-mutating check verifies the table/status read path. Run migration 0003 to guarantee the archived check constraint.",
  });

  const ok = checks.every((item) => item.ok);
  if (!ok) console.error("[supabase-schema]", checks);

  return NextResponse.json(
    {
      ok,
      expectedMigration: "supabase/migrations/0003_universal_index.sql",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 500 },
  );
}

async function checkSchema(
  name: string,
  query: () => Promise<{ error: unknown }>,
): Promise<SchemaCheck> {
  try {
    const { error } = await query();
    if (!error) return { name, ok: true };
    console.error("[supabase-schema]", name, error);
    return { name, ok: false, error: readableError(error) };
  } catch (error) {
    console.error("[supabase-schema]", name, error);
    return { name, ok: false, error: readableError(error) };
  }
}

function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error);
}
