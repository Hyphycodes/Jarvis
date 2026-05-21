"use client";

import { useState, useTransition, type KeyboardEvent } from "react";

type Props = {
  label: string;
  value: string[];
  editable: boolean;
  placeholder?: string;
  /** Visually subdued (e.g. avoid / dealbreakers). */
  muted?: boolean;
  onSave: (next: string[]) => Promise<void>;
};

export function EditableTagList({
  label,
  value,
  editable,
  placeholder = "Add a tag…",
  muted = false,
  onSave,
}: Props) {
  const [tags, setTags] = useState<string[]>(value ?? []);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addFromDraft() {
    const next = draft.trim();
    if (!next) return;
    if (tags.includes(next)) {
      setDraft("");
      return;
    }
    setTags((t) => [...t, next]);
    setDraft("");
    setDirty(true);
  }

  function removeTag(t: string) {
    setTags((cur) => cur.filter((x) => x !== t));
    setDirty(true);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addFromDraft();
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  function commit() {
    setError(null);
    startTransition(async () => {
      try {
        // flush any pending draft first
        const final = draft.trim()
          ? Array.from(new Set([...tags, draft.trim()]))
          : tags;
        await onSave(final);
        setTags(final);
        setDraft("");
        setDirty(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-4 border-b border-divider/40 py-4">
      <div className="text-[10px] uppercase tracking-editorial text-warm-ivory/45">
        {label}
      </div>
      <div className="min-w-0">
        <ul className="flex flex-wrap gap-1.5">
          {tags.length === 0 && !editable ? (
            <li className="text-[13px] text-warm-ivory/35">No items.</li>
          ) : null}
          {tags.map((t) => (
            <li
              key={t}
              className={
                "inline-flex items-center gap-1 border px-2 py-1 text-[12px] leading-tight " +
                (muted
                  ? "border-divider text-warm-ivory/50"
                  : "border-muted-gold/30 text-warm-ivory/85")
              }
            >
              <span>{t}</span>
              {editable ? (
                <button
                  type="button"
                  aria-label={`Remove ${t}`}
                  onClick={() => removeTag(t)}
                  className="text-warm-ivory/45 hover:text-warm-ivory/80"
                >
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {editable ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              placeholder={placeholder}
              disabled={pending}
              className="min-w-[140px] flex-1 border-b border-divider bg-transparent px-1 py-1 text-[13px] text-warm-ivory placeholder-warm-ivory/30 outline-none focus:border-muted-gold/60"
            />
            <button
              type="button"
              onClick={addFromDraft}
              disabled={pending || !draft.trim()}
              className="text-[11px] uppercase tracking-editorial text-warm-ivory/55 disabled:opacity-40"
            >
              Add
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={pending || (!dirty && !draft.trim())}
              className="text-[11px] uppercase tracking-editorial text-muted-gold disabled:opacity-40"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        ) : null}
        {error ? (
          <div className="mt-2 text-[11px] text-muted-gold/85">{error}</div>
        ) : null}
      </div>
    </div>
  );
}
