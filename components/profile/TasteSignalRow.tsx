"use client";

import { useState, useTransition } from "react";
import {
  adjustSignalWeight,
  deleteTasteSignal,
  updateTasteSignal,
} from "@/lib/actions/taste";
import type { SignalDirection, TasteSignalRow as Row } from "@/lib/types/database";

export function TasteSignalRow({
  signal,
  editable,
}: {
  signal: Row;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [trait, setTrait] = useState(signal.trait);
  const [direction, setDirection] = useState<SignalDirection>(signal.direction);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const weight = Number(signal.weight) || 1;
  const weightPct = Math.min(100, Math.round((weight / 3) * 100)); // weight 3.0 = full bar

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      try {
        await fn();
      } catch {
        // ignore — could surface inline later
      }
    });
  }

  return (
    <li className="grid grid-cols-[1fr_auto] items-start gap-3 border-b border-divider/40 py-3">
      <div className="min-w-0">
        {editing ? (
          <div className="flex flex-col gap-2">
            <input
              value={trait}
              onChange={(e) => setTrait(e.target.value)}
              disabled={pending}
              className="w-full border border-divider bg-transparent px-2 py-1.5 text-[14px] text-warm-ivory outline-none focus:border-muted-gold/70"
            />
            <select
              value={direction}
              onChange={(e) =>
                setDirection(e.target.value as SignalDirection)
              }
              disabled={pending}
              className="self-start border border-divider bg-near-black px-2 py-1 text-[11px] uppercase tracking-editorial text-warm-ivory/85 outline-none"
            >
              <option value="positive">Positive</option>
              <option value="negative">Negative</option>
            </select>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={pending || !trait.trim()}
                onClick={() =>
                  run(async () => {
                    await updateTasteSignal({
                      id: signal.id,
                      trait,
                      direction,
                    });
                    setEditing(false);
                  })
                }
                className="text-[11px] uppercase tracking-editorial text-muted-gold disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setTrait(signal.trait);
                  setDirection(signal.direction);
                  setEditing(false);
                }}
                className="text-[11px] uppercase tracking-editorial text-warm-ivory/45"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <DirectionDot direction={signal.direction} />
              <span className="text-[14px] leading-[1.45] text-warm-ivory/90">
                {signal.trait}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-editorial text-warm-ivory/45">
              {signal.category ? <span>{signal.category}</span> : null}
              {signal.category ? <span aria-hidden>·</span> : null}
              <span className="relative h-[3px] w-20 overflow-hidden bg-divider">
                <span
                  className={
                    "absolute inset-y-0 left-0 " +
                    (signal.direction === "positive"
                      ? "bg-muted-gold/70"
                      : "bg-warm-ivory/35")
                  }
                  style={{ width: `${weightPct}%` }}
                />
              </span>
              <span className="tracking-normal normal-case text-warm-ivory/40">
                w{weight.toFixed(1)}
              </span>
            </div>
          </>
        )}
      </div>

      {editable && !editing ? (
        <div className="flex shrink-0 flex-col items-end gap-1 text-[10px] uppercase tracking-editorial">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(async () => adjustSignalWeight({ id: signal.id, delta: -0.2 }))}
            className="text-warm-ivory/55"
          >
            Reduce
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setEditing(true)}
            className="text-warm-ivory/55"
          >
            Edit
          </button>
          {confirmDelete ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(async () => deleteTasteSignal({ id: signal.id }))}
                className="text-muted-gold"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-warm-ivory/45"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-warm-ivory/35"
            >
              Delete
            </button>
          )}
        </div>
      ) : null}
    </li>
  );
}

function DirectionDot({ direction }: { direction: SignalDirection }) {
  return (
    <span
      aria-hidden
      className={
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full " +
        (direction === "positive" ? "bg-muted-gold" : "bg-warm-ivory/30")
      }
    />
  );
}
