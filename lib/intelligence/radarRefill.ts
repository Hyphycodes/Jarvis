import "server-only";

import { requireOwner } from "@/lib/auth";
import { RADAR_ACTIVE_ITEM_LIMIT, RADAR_MIN_ACTIVE_ITEM_TARGET } from "@/lib/brain/constants";
import { runAmbientIntelligence } from "@/lib/intelligence/ambientRuns";
import { cleanupRadar } from "@/lib/intelligence/radarCleanup";
import {
  readCurrentRadarBoard,
  rotateWeakActiveRadarItems,
} from "@/lib/intelligence/radarCurator";
import type { AmbientRunSummary } from "@/lib/intelligence/ambientRuns";

export type RadarRefillSummary = {
  ok: true;
  trigger: string;
  skipped?: boolean;
  reason?: string;
  active_before: number;
  active_after: number;
  target: number;
  cap: number;
  attempts: number;
  runs: AmbientRunSummary[];
  cleanup?: Awaited<ReturnType<typeof cleanupRadar>>;
  rotated?: Awaited<ReturnType<typeof rotateWeakActiveRadarItems>>;
  missing_context: string[];
};

export async function refillRadarBoard(input: {
  trigger: string;
  force?: boolean;
  maxAttempts?: number;
}): Promise<RadarRefillSummary> {
  const owner = await requireOwner();
  const beforeBoard = await readCurrentRadarBoard();
  const cleanup = await cleanupRadar(owner.id);
  const rotated = input.force ? await rotateWeakActiveRadarItems(owner.id) : undefined;
  let board = await readCurrentRadarBoard();
  const runs: AmbientRunSummary[] = [];
  const maxAttempts = input.maxAttempts ?? 2;

  if (board.items.length >= RADAR_MIN_ACTIVE_ITEM_TARGET && !input.force) {
    return {
      ok: true,
      trigger: input.trigger,
      skipped: true,
      reason: "Radar already has enough strong items.",
      active_before: beforeBoard.items.length,
      active_after: board.items.length,
      target: RADAR_MIN_ACTIVE_ITEM_TARGET,
      cap: RADAR_ACTIVE_ITEM_LIMIT,
      attempts: 0,
      runs,
      cleanup,
      rotated,
      missing_context: board.missingContext,
    };
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (board.items.length >= RADAR_MIN_ACTIVE_ITEM_TARGET) break;
    if (board.items.length >= RADAR_ACTIVE_ITEM_LIMIT) break;
    const run = await runAmbientIntelligence({
      runType: "radar_discovery",
      force: input.force || attempt > 0,
    });
    runs.push(run);
    board = await readCurrentRadarBoard();
    if (run.skipped || (run.inserted + run.updated + run.selected === 0 && attempt > 0)) {
      break;
    }
  }

  const missing = [...board.missingContext];
  if (board.items.length < RADAR_MIN_ACTIVE_ITEM_TARGET) {
    missing.push("Bounded refill stopped before target; preserving selectivity instead of padding.");
  }
  console.info("[radar.refill]", {
    trigger: input.trigger,
    activeBefore: beforeBoard.items.length,
    activeAfter: board.items.length,
    attempts: runs.length,
    missing,
  });

  return {
    ok: true,
    trigger: input.trigger,
    active_before: beforeBoard.items.length,
    active_after: board.items.length,
    target: RADAR_MIN_ACTIVE_ITEM_TARGET,
    cap: RADAR_ACTIVE_ITEM_LIMIT,
    attempts: runs.length,
    runs,
    cleanup,
    rotated,
    missing_context: missing,
  };
}

export async function scheduleRadarAutoRefill(input: {
  trigger: string;
  itemId?: string;
}): Promise<void> {
  try {
    const board = await readCurrentRadarBoard();
    if (board.items.length >= RADAR_MIN_ACTIVE_ITEM_TARGET) return;
    await refillRadarBoard({
      trigger: input.itemId ? `${input.trigger}:${input.itemId}` : input.trigger,
      force: false,
      maxAttempts: 1,
    });
  } catch (error) {
    console.error("[radar.refill] auto refill failed", {
      trigger: input.trigger,
      itemId: input.itemId,
      error,
    });
  }
}

