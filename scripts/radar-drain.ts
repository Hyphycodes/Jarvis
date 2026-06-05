/**
 * One-off Radar backlog drain (Prompt 2, Task 6).
 *
 * Runs the autopilot repeatedly over the existing candidate backlog so every
 * category fills toward its best-5, then prints a per-category summary of what
 * is shown (score + whether it has a real photo).
 *
 *   pnpm exec tsx scripts/radar-drain.ts
 *
 * Honest cost note: this spends real provider (Brave/SerpAPI/etc.) and Claude
 * budget and writes to production Radar. It only runs when you invoke it.
 * Env keys are read from .env.local / .env (same loader as scripts/smoke.ts).
 *
 * Optional env: DRAIN_MAX_RUNS (default 12), DRAIN_USER_ID (default: the single
 * founder_profile owner).
 */
import { readFileSync } from "node:fs";

loadEnvFile(".env.local");
loadEnvFile(".env");

function loadEnvFile(path: string) {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

const MAX_RUNS = Number(process.env.DRAIN_MAX_RUNS ?? 12);

async function main() {
  // Imported after env is loaded so server modules see the keys.
  const { runRadarAutopilot } = await import("../lib/radar/autopilot");
  const { normalizeAutopilotMode } = await import("../lib/radar/autopilotRuns");
  const { getSupabaseServiceClient } = await import("../lib/supabase/server");
  const { RADAR_CATEGORIES } = await import("../lib/radar/category");

  // Preflight: this script needs *real* prod credentials. A fresh checkout ships
  // .env.local with placeholders, so fail fast with guidance instead of a cryptic
  // "fetch failed" on the first DB call.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (supabaseUrl.includes("placeholder") || serviceKey.length < 100) {
    console.error(
      "Refusing to run: .env.local has placeholder Supabase credentials.\n" +
        "Pull the real env first:  vercel env pull .env.local\n" +
        "Or trigger the deployed autopilot instead:\n" +
        '  curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-app>/api/radar/autopilot?mode=manual_force"',
    );
    process.exit(1);
  }

  const supabase = getSupabaseServiceClient();
  const { data: owner, error: ownerError } = await supabase
    .from("founder_profile")
    .select("user_id")
    .limit(1)
    .maybeSingle();
  if (ownerError) {
    console.error(`Could not read founder_profile: ${ownerError.message}`);
    process.exit(1);
  }
  const userId = process.env.DRAIN_USER_ID ?? (owner as { user_id?: string } | null)?.user_id;
  if (!userId) {
    console.error("No owner user_id found (set DRAIN_USER_ID or seed founder_profile).");
    process.exit(1);
  }

  const mode = normalizeAutopilotMode("manual_force");
  let prevInbox = Number.POSITIVE_INFINITY;
  let stagnant = 0;

  console.log(`Draining backlog for ${userId} — up to ${MAX_RUNS} runs.\n`);
  for (let i = 1; i <= MAX_RUNS; i++) {
    const result = await runRadarAutopilot({ userId, mode, force: true });
    const inbox = result.candidateInboxAfter ?? result.candidateInboxCount ?? 0;
    const active = result.activeAfter ?? result.activeCount;
    console.log(
      `run ${i}: op=${result.operation} promoted=${result.candidatesPromoted} held=${result.candidatesHeld} ` +
        `inbox=${inbox} active=${active} status=${result.runStatus ?? "?"}\n        ${result.summary}`,
    );
    if (inbox >= prevInbox && result.candidatesPromoted === 0) stagnant++;
    else stagnant = 0;
    prevInbox = inbox;
    if (stagnant >= 2) {
      console.log("\nNo further progress over two runs; stopping.");
      break;
    }
  }

  const { data: shown } = await supabase
    .from("surfaced_items")
    .select("category,title,score,image_url")
    .eq("user_id", userId)
    .eq("destination", "radar")
    .in("status", ["shown", "opened"])
    .order("score", { ascending: false });

  const byCat = new Map<string, Array<{ title: string; score: number; hasImage: boolean }>>();
  for (const c of RADAR_CATEGORIES) byCat.set(c, []);
  for (const row of (shown ?? []) as Array<{ category: string | null; title: string | null; score: number | null; image_url: string | null }>) {
    const cat = row.category ?? "(uncategorized)";
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push({ title: row.title ?? "Untitled", score: Number(row.score ?? 0), hasImage: Boolean(row.image_url) });
  }

  console.log("\n── Radar per-category (shown) ──");
  let withImages = 0;
  let total = 0;
  for (const [cat, items] of byCat) {
    console.log(`\n${cat} (${items.length}/5):`);
    if (items.length === 0) {
      console.log("  (empty — gap flagged for Scout)");
      continue;
    }
    for (const it of items.slice(0, 5)) {
      total++;
      if (it.hasImage) withImages++;
      console.log(`  ${it.score.toFixed(2)}  ${it.hasImage ? "[photo]" : "[ no  ]"}  ${it.title}`);
    }
  }
  if (total > 0) {
    console.log(`\nPhotos: ${withImages}/${total} shown items have a real image (${Math.round((withImages / total) * 100)}%).`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
