"use client";

import { useState, useTransition } from "react";

type Props = {
  label: string;
  value: string | null | undefined;
  editable: boolean;
  multiline?: boolean;
  placeholder?: string;
  onSave: (next: string | null) => Promise<void>;
};

export function EditableField({
  label,
  value,
  editable,
  multiline = false,
  placeholder = "Empty",
  onSave,
}: Props) {
  const [draft, setDraft] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit() {
    setError(null);
    startTransition(async () => {
      try {
        const trimmed = draft.trim();
        await onSave(trimmed.length === 0 ? null : trimmed);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  if (!editable) {
    return (
      <div className="grid grid-cols-[140px_1fr] items-start gap-4 border-b border-divider/40 py-3">
        <div className="text-[10px] uppercase tracking-editorial text-warm-ivory/45">
          {label}
        </div>
        <div className="text-[14px] leading-[1.5] text-warm-ivory/85">
          {value || (
            <span className="text-warm-ivory/35">{placeholder}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-4 border-b border-divider/40 py-3">
      <div className="text-[10px] uppercase tracking-editorial text-warm-ivory/45">
        {label}
      </div>
      <div className="min-w-0">
        {editing ? (
          <div className="flex flex-col gap-2">
            {multiline ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                disabled={pending}
                className="w-full resize-none border border-divider bg-transparent px-2 py-1.5 text-[14px] leading-[1.5] text-warm-ivory outline-none focus:border-muted-gold/70"
              />
            ) : (
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={pending}
                className="w-full border border-divider bg-transparent px-2 py-1.5 text-[14px] text-warm-ivory outline-none focus:border-muted-gold/70"
              />
            )}
            {error ? (
              <span className="text-[11px] text-muted-gold/85">{error}</span>
            ) : null}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={commit}
                disabled={pending}
                className="text-[11px] uppercase tracking-editorial text-muted-gold disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(value ?? "");
                  setError(null);
                  setEditing(false);
                }}
                disabled={pending}
                className="text-[11px] uppercase tracking-editorial text-warm-ivory/45"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="w-full text-left text-[14px] leading-[1.5] text-warm-ivory/85 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory"
          >
            {value || <span className="text-warm-ivory/35">{placeholder}</span>}
          </button>
        )}
      </div>
    </div>
  );
}
