"use client";

import { useState, useTransition } from "react";
import {
  archiveMemoryItem,
  deleteMemoryItem,
  pinMemoryItem,
  updateMemoryItem,
} from "@/lib/actions/memory";
import type { MemoryItemRow, MemoryKind } from "@/lib/types/database";

const KIND_OPTIONS: MemoryKind[] = [
  "identity",
  "preference",
  "pattern",
  "principle",
  "context",
];

export function MemoryItemCard({
  item,
  editable,
}: {
  item: MemoryItemRow;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.content);
  const [kind, setKind] = useState<MemoryKind>(item.kind);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      try {
        await fn();
      } catch {
        // Server actions throw plain Error; surface gently if needed later.
      }
    });
  }

  return (
    <article
      className={
        "border-l-2 py-4 pl-4 pr-2 transition-colors duration-300 ease-atmospheric " +
        (item.is_pinned
          ? "border-muted-gold/70 bg-soft-black/40"
          : "border-divider/60")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                disabled={pending}
                className="w-full resize-none border border-divider bg-transparent p-2 text-[14px] leading-[1.5] text-warm-ivory outline-none focus:border-muted-gold/70"
              />
              <div className="flex items-center gap-2">
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as MemoryKind)}
                  disabled={pending}
                  className="border border-divider bg-near-black px-2 py-1 text-[11px] uppercase tracking-editorial text-warm-ivory/85 outline-none"
                >
                  {KIND_OPTIONS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      await updateMemoryItem({
                        id: item.id,
                        content: draft,
                        kind,
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
                  disabled={pending}
                  onClick={() => {
                    setDraft(item.content);
                    setKind(item.kind);
                    setEditing(false);
                  }}
                  className="text-[11px] uppercase tracking-editorial text-warm-ivory/45"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="font-serif text-[15px] leading-[1.45] text-warm-ivory/90">
              {item.content}
            </p>
          )}

          <div className="mt-3 flex items-center gap-3 text-[10px] uppercase tracking-editorial text-warm-ivory/45">
            <span>{item.kind}</span>
            <span aria-hidden>·</span>
            <ConfidenceBar value={item.confidence} />
          </div>
        </div>

        {editable && !editing ? (
          <div className="flex shrink-0 flex-col items-end gap-1.5 text-[10px] uppercase tracking-editorial">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () =>
                  pinMemoryItem({ id: item.id, pinned: !item.is_pinned }),
                )
              }
              className={
                item.is_pinned ? "text-muted-gold" : "text-warm-ivory/50"
              }
            >
              {item.is_pinned ? "Pinned" : "Pin"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setEditing(true)}
              className="text-warm-ivory/55"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(async () => archiveMemoryItem({ id: item.id }))}
              className="text-warm-ivory/45"
            >
              Archive
            </button>
            {confirmDelete ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => deleteMemoryItem({ id: item.id }))
                  }
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
                disabled={pending}
                onClick={() => setConfirmDelete(true)}
                className="text-warm-ivory/35"
              >
                Delete
              </button>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative h-[3px] w-14 overflow-hidden bg-divider">
        <span
          className="absolute inset-y-0 left-0 bg-muted-gold/70"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="tracking-normal normal-case text-warm-ivory/45">
        {pct}%
      </span>
    </span>
  );
}
