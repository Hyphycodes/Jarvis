import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  commitTasteSeedImport,
  dryRunTasteSeedImport,
} from "../lib/tasteSeed/importer";

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find((arg) => !arg.startsWith("--"));
  const commit = args.includes("--commit");
  const userIdArg = args.find((arg) => arg.startsWith("--user-id="));
  const userId = userIdArg?.slice("--user-id=".length);

  if (!fileArg) {
    console.error("Usage: pnpm run import:taste-seed -- path/to/file.md [--commit] [--user-id=<uuid>]");
    process.exit(1);
  }

  const filePath = resolve(fileArg);
  const markdown = readFileSync(filePath, "utf8");
  const fileName = basename(filePath);

  if (!commit) {
    const result = dryRunTasteSeedImport({ markdown, fileName });
    console.log(JSON.stringify({
      ok: result.ok,
      mode: result.mode,
      fileName: result.fileName,
      summary: result.summary,
    }, null, 2));
    return;
  }

  const { getSupabaseServiceClient } = await import("../lib/supabase/server");
  const supabase = getSupabaseServiceClient();
  const resolvedUserId = userId ?? await findOwnerUserId(supabase);
  if (!resolvedUserId) {
    throw new Error("Owner user id not found. Pass --user-id=<uuid> or create founder_profile first.");
  }

  const result = await commitTasteSeedImport({
    userId: resolvedUserId,
    markdown,
    fileName,
    supabase,
  });
  console.log(JSON.stringify({
    ok: result.ok,
    mode: result.mode,
    fileName: result.fileName,
    traceId: result.traceId ?? null,
    summary: result.summary,
  }, null, 2));
}

async function findOwnerUserId(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("founder_profile")
    .select("user_id")
    .limit(1)
    .maybeSingle();
  return (data as { user_id?: string } | null)?.user_id ?? null;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
