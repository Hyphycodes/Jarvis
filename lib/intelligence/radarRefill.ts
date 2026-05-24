import "server-only";

import { requireOwner } from "@/lib/auth";
import { RADAR_ACTIVE_ITEM_LIMIT, RADAR_MIN_ACTIVE_ITEM_TARGET } from "@/lib/brain/constants";
import { runAmbientIntelligence } from "@/lib/intelligence/ambientRuns";
import { cleanupRadar } from "@/lib/intelligence/radarCleanup";
import {
  promoteQualifiedHoldingItems,
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
  promoted_holding?: Awaited<ReturnType<typeof promoteQualifiedHoldingItems>>;
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
  let promotedHolding: Awaited<ReturnType<typeof promoteQualifiedHoldingItems>> | undefined;
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
      promoted_holding: promotedHolding,
      missing_context: board.missingContext,
    };
  }

  if (board.items.length < RADAR_MIN_ACTIVE_ITEM_TARGET) {
    promotedHolding = await promoteQualifiedHoldingItems(
      owner.id,
      Math.min(
        RADAR_MIN_ACTIVE_ITEM_TARGET - board.items.length,
        RADAR_ACTIVE_ITEM_LIMIT - board.items.length,
      ),
    );
    if (promotedHolding.promoted > 0) {
      board = await readCurrentRadarBoard();
    }
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
    if (board.items.length < RADAR_MIN_ACTIVE_ITEM_TARGET) {
      const nextPromotion = await promoteQualifiedHoldingItems(
        owner.id,
        Math.min(
          RADAR_MIN_ACTIVE_ITEM_TARGET - board.items.length,
          RADAR_ACTIVE_ITEM_LIMIT - board.items.length,
        ),
      );
      if (nextPromotion.promoted > 0) {
        promotedHolding = mergePromotionResults(promotedHolding, nextPromotion);
        board = await readCurrentRadarBoard();
      } else if (!promotedHolding) {
        promotedHolding = nextPromotion;
      }
    }
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
    promotedHolding,
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
    promoted_holding: promotedHolding,
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

function mergePromotionResults(
  current: Awaited<ReturnType<typeof promoteQualifiedHoldingItems>> | undefined,
  next: Awaited<ReturnType<typeof promoteQualifiedHoldingItems>>,
): Awaited<ReturnType<typeof promoteQualifiedHoldingItems>> {
  if (!current) return next;
  return {
    reviewed: current.reviewed + next.reviewed,
    promoted: current.promoted + next.promoted,
    blocked: current.blocked + next.blocked,
    promoted_ids: [...current.promoted_ids, ...next.promoted_ids],
    reasons: [...current.reasons, ...next.reasons],
  };
}
