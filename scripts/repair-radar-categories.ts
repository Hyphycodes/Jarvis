/**
 * One-off repair for production Radar category/type drift.
 *
 * It re-runs the deterministic category normalizer over active/holding rows and
 * updates only category, type, payload.category_normalization, and updated_at.
 * Lifecycle state is intentionally untouched.
 *
 *   pnpm exec tsx scripts/repair-radar-categories.ts
 *
 * Optional:
 *   REPAIR_USER_ID=<uuid>       target a specific founder
 *   REPAIR_DRY_RUN=1           print the repair plan without writing
 */
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeRadarClassification } from "../lib/radar/category";
import type { Json, SurfacedItemRow } from "../lib/types/database";

loadEnvFile(".env.local");
loadEnvFile(".env");

const TARGET_STATUSES = ["shown", "discovered", "opened"];
const TARGET_DESTINATIONS = ["radar", "holding"];
const DRY_RUN = process.env.REPAIR_DRY_RUN === "1";

type CountRow = {
  category: string;
  type: string;
  count: number;
};

type FixedRow = {
  id: string;
  title: string;
  status: string;
  destination: string;
  from: { category: string | null; type: string | null };
  to: { category: string; type: string };
};

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

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (supabaseUrl.includes("placeholder") || serviceKey.length < 100) {
    console.error(
      "Refusing to run: local Supabase credentials are missing or placeholders.\n" +
        "Pull the real env first: vercel env pull .env.local",
    );
    process.exit(1);
  }

  const { getSupabaseServiceClient } = await import("../lib/supabase/server");
  const supabase = getSupabaseServiceClient();
  const userId = process.env.REPAIR_USER_ID ?? await readOwnerUserId(supabase);
  if (!userId) {
    console.error("No owner user_id found. Set REPAIR_USER_ID.");
    process.exit(1);
  }

  const beforeRows = await readTargetRows(supabase, userId);
  const fixes = plannedFixes(beforeRows);

  if (!DRY_RUN) {
    for (const fix of fixes) {
      const row = beforeRows.find((candidate) => candidate.id === fix.id);
      if (!row) continue;
      const payload = patchPayload(row.payload, fix);
      const { error } = await supabase
        .from("surfaced_items")
        .update({
          category: fix.to.category,
          type: fix.to.type,
          payload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", fix.id)
        .eq("user_id", userId);
      if (error) {
        throw new Error(`${fix.title}: ${error.message}`);
      }
    }
  }

  const afterRows = DRY_RUN ? applyFixes(beforeRows, fixes) : await readTargetRows(supabase, userId);
  const output = {
    userId,
    dryRun: DRY_RUN,
    scanned: beforeRows.length,
    fixed: fixes.length,
    beforeCounts: countsByCategoryType(beforeRows),
    afterCounts: countsByCategoryType(afterRows),
    sampleFixedRows: sampleFixes(fixes, 5),
  };
  console.log(JSON.stringify(output, null, 2));
}

async function readOwnerUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from("founder_profile")
    .select("user_id")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not read founder_profile: ${error.message}`);
  return typeof data?.user_id === "string" ? data.user_id : null;
}

async function readTargetRows(supabase: SupabaseClient, userId: string): Promise<SurfacedItemRow[]> {
  const all: SurfacedItemRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("surfaced_items")
      .select("*")
      .eq("user_id", userId)
      .in("status", TARGET_STATUSES)
      .in("destination", TARGET_DESTINATIONS)
      .order("updated_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error(`Could not read surfaced_items: ${error.message}`);
    const rows = (data ?? []) as SurfacedItemRow[];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

function plannedFixes(rows: SurfacedItemRow[]): FixedRow[] {
  const fixes: FixedRow[] = [];
  for (const row of rows) {
    const classification = normalizeRadarClassification({
      category: row.category,
      type: row.type,
      title: row.title,
      subtitle: row.subtitle,
      description: row.description,
      locationName: row.location_name,
      startsAt: row.starts_at,
      tags: row.tags,
      reasons: row.reasons,
      sourcePayload: row.payload,
    });
    if (!classification.category || !classification.type) continue;
    if (classification.category === row.category && classification.type === row.type) continue;
    fixes.push({
      id: row.id,
      title: row.title ?? "Untitled",
      status: row.status,
      destination: row.destination,
      from: { category: row.category, type: row.type },
      to: { category: classification.category, type: classification.type },
    });
  }
  return fixes;
}

function applyFixes(rows: SurfacedItemRow[], fixes: FixedRow[]): SurfacedItemRow[] {
  const byId = new Map(fixes.map((fix) => [fix.id, fix]));
  return rows.map((row) => {
    const fix = byId.get(row.id);
    if (!fix) return row;
    return {
      ...row,
      category: fix.to.category,
      type: fix.to.type,
      payload: patchPayload(row.payload, fix),
    };
  });
}

function patchPayload(payload: Json | null, fix: FixedRow): Json {
  const base = isRecord(payload) ? payload : {};
  return {
    ...base,
    category_normalization: {
      source: "repair-radar-categories",
      normalized_at: new Date().toISOString(),
      previous_category: fix.from.category,
      previous_type: fix.from.type,
      category: fix.to.category,
      type: fix.to.type,
    },
  } as Json;
}

function countsByCategoryType(rows: SurfacedItemRow[]): CountRow[] {
  const counts = new Map<string, CountRow>();
  for (const row of rows) {
    const category = row.category ?? "(null)";
    const type = row.type ?? "(null)";
    const key = `${category}\u0000${type}`;
    const current = counts.get(key) ?? { category, type, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()].sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      a.type.localeCompare(b.type),
  );
}

function sampleFixes(fixes: FixedRow[], limit: number): FixedRow[] {
  const priority = ["Bronzeville Winery", "L7 Chicago", "Lakefront Trail"];
  return fixes
    .slice()
    .sort((a, b) => sampleRank(a.title, priority) - sampleRank(b.title, priority))
    .slice(0, limit);
}

function sampleRank(title: string, priority: string[]): number {
  const idx = priority.findIndex((needle) => title.toLowerCase().includes(needle.toLowerCase()));
  return idx === -1 ? priority.length : idx;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
