"use client";

import { useState } from "react";
import type { TastemakerRow } from "@/lib/types/database";

const ROLES = [
  "promoter",
  "dj",
  "chef",
  "writer",
  "venue_owner",
  "curator",
  "friend_in_the_scene",
] as const;

type Role = (typeof ROLES)[number];

type FormState = {
  name: string;
  role: Role | "";
  notes: string;
  instagram_handle: string;
  website_url: string;
  newsletter_url: string;
  ra_url: string;
  soundcloud_url: string;
  bandcamp_url: string;
  linktree_url: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  role: "",
  notes: "",
  instagram_handle: "",
  website_url: "",
  newsletter_url: "",
  ra_url: "",
  soundcloud_url: "",
  bandcamp_url: "",
  linktree_url: "",
};

function fromRow(row: TastemakerRow): FormState {
  return {
    name: row.name,
    role: (row.role as Role | null) ?? "",
    notes: row.notes ?? "",
    instagram_handle: row.instagram_handle ?? "",
    website_url: row.website_url ?? "",
    newsletter_url: row.newsletter_url ?? "",
    ra_url: row.ra_url ?? "",
    soundcloud_url: row.soundcloud_url ?? "",
    bandcamp_url: row.bandcamp_url ?? "",
    linktree_url: row.linktree_url ?? "",
  };
}

// ── Add form ──────────────────────────────────────────────────────────────────

export function AddTastemakerForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!form.name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tastemakers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          role: form.role || null,
          notes: form.notes.trim() || null,
          instagram_handle: form.instagram_handle.trim() || null,
          website_url: form.website_url.trim() || null,
          newsletter_url: form.newsletter_url.trim() || null,
          ra_url: form.ra_url.trim() || null,
          soundcloud_url: form.soundcloud_url.trim() || null,
          bandcamp_url: form.bandcamp_url.trim() || null,
          linktree_url: form.linktree_url.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to add tastemaker");
      }
      setForm(EMPTY_FORM);
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="lux-action rounded-full px-5 py-2.5 text-[11px] uppercase tracking-[0.18em]"
        >
          + Add Tastemaker
        </button>
      ) : (
        <div className="lux-surface rounded-[var(--radius-card)] px-5 py-5">
          <div className="mb-4 text-[11px] uppercase tracking-[0.2em] text-warm-ivory/55">
            New Tastemaker
          </div>
          <TastemakerForm form={form} onChange={setForm} />
          {error ? (
            <p className="mt-3 text-[12px] text-[#E07A6E]">{error}</p>
          ) : null}
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !form.name.trim()}
              className="lux-action rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.16em] disabled:opacity-40"
            >
              {loading ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setForm(EMPTY_FORM); setError(null); }}
              className="text-[12px] text-warm-ivory/40 hover:text-warm-ivory/70"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Edit / Delete row ─────────────────────────────────────────────────────────

export function TastemakerRowActions({
  tastemaker,
  onChanged,
}: {
  tastemaker: TastemakerRow;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(fromRow(tastemaker));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tastemakers/${tastemaker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          role: form.role || null,
          notes: form.notes.trim() || null,
          instagram_handle: form.instagram_handle.trim() || null,
          website_url: form.website_url.trim() || null,
          newsletter_url: form.newsletter_url.trim() || null,
          ra_url: form.ra_url.trim() || null,
          soundcloud_url: form.soundcloud_url.trim() || null,
          bandcamp_url: form.bandcamp_url.trim() || null,
          linktree_url: form.linktree_url.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to update");
      }
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove ${tastemaker.name}?`)) return;
    setLoading(true);
    try {
      await fetch(`/api/tastemakers/${tastemaker.id}`, { method: "DELETE" });
      onChanged();
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-3">
        <TastemakerForm form={form} onChange={setForm} />
        {error ? (
          <p className="mt-2 text-[12px] text-[#E07A6E]">{error}</p>
        ) : null}
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="lux-action rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.16em] disabled:opacity-40"
          >
            {loading ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setForm(fromRow(tastemaker)); setError(null); }}
            className="text-[12px] text-warm-ivory/40 hover:text-warm-ivory/70"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-3">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-[11px] text-warm-ivory/40 hover:text-warm-ivory/70"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={handleDelete}
        disabled={loading}
        className="text-[11px] text-[#E07A6E]/60 hover:text-[#E07A6E] disabled:opacity-40"
      >
        Remove
      </button>
    </div>
  );
}

// ── Shared form fields ────────────────────────────────────────────────────────

function TastemakerForm({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (f: FormState) => void;
}) {
  function set(key: keyof FormState, value: string) {
    onChange({ ...form, [key]: value });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Name *</Label>
          <Input
            value={form.name}
            placeholder="Person or entity name"
            onChange={(v) => set("name", v)}
          />
        </div>
        <div>
          <Label>Role</Label>
          <select
            value={form.role}
            onChange={(e) => set("role", e.target.value as Role | "")}
            className="w-full rounded-[var(--radius-soft)] border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[13px] text-warm-ivory/88 focus:outline-none focus:ring-1 focus:ring-muted-gold/40"
          >
            <option value="">— select —</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Instagram</Label>
          <Input
            value={form.instagram_handle}
            placeholder="@handle (reference only)"
            onChange={(v) => set("instagram_handle", v)}
          />
        </div>
      </div>

      <div>
        <Label>Notes</Label>
        <textarea
          value={form.notes}
          onChange={(e) => onChange({ ...form, notes: e.target.value })}
          placeholder="Why they matter"
          rows={2}
          className="w-full resize-none rounded-[var(--radius-soft)] border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[13px] text-warm-ivory/88 placeholder:text-warm-ivory/30 focus:outline-none focus:ring-1 focus:ring-muted-gold/40"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Website</Label>
          <Input value={form.website_url} placeholder="https://…" onChange={(v) => set("website_url", v)} />
        </div>
        <div>
          <Label>RA page</Label>
          <Input value={form.ra_url} placeholder="https://ra.co/…" onChange={(v) => set("ra_url", v)} />
        </div>
        <div>
          <Label>Newsletter</Label>
          <Input value={form.newsletter_url} placeholder="https://…" onChange={(v) => set("newsletter_url", v)} />
        </div>
        <div>
          <Label>Linktree</Label>
          <Input value={form.linktree_url} placeholder="https://linktr.ee/…" onChange={(v) => set("linktree_url", v)} />
        </div>
        <div>
          <Label>SoundCloud</Label>
          <Input value={form.soundcloud_url} placeholder="https://soundcloud.com/…" onChange={(v) => set("soundcloud_url", v)} />
        </div>
        <div>
          <Label>Bandcamp</Label>
          <Input value={form.bandcamp_url} placeholder="https://….bandcamp.com" onChange={(v) => set("bandcamp_url", v)} />
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-warm-ivory/40">
      {children}
    </div>
  );
}

function Input({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-[var(--radius-soft)] border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[13px] text-warm-ivory/88 placeholder:text-warm-ivory/30 focus:outline-none focus:ring-1 focus:ring-muted-gold/40"
    />
  );
}

// ── Refresh button ────────────────────────────────────────────────────────────

export function RefreshList({ onRefresh }: { onRefresh: () => void }) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      className="text-[11px] text-warm-ivory/40 hover:text-warm-ivory/70"
    >
      Refresh
    </button>
  );
}
