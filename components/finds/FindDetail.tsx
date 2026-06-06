"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductDossier, ProductPick } from "@/lib/brain/productResearcher";

const muted = "var(--text-muted)";
const gold = "var(--gold)";

const REFINE_PRESETS = ["Nicer", "Darker", "More old-school", "Under $300", "More masculine", "Simpler", "Better quality"];

export function FindDetail({ itemId, dossier }: { itemId: string; dossier: ProductDossier }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [refineText, setRefineText] = useState("");
  const pick = dossier.best_pick;

  async function refine(refineValue: string) {
    if (!refineValue.trim() || busy) return;
    setBusy(true);
    setNote(`Reworking — ${refineValue.toLowerCase()}…`);
    try {
      const res = await fetch("/api/finds/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, refine: refineValue.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; best?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Refine failed");
      setNote(data.best ? `New pick: ${data.best}` : "Updated.");
      setRefineText("");
      router.refresh();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Refine failed");
    } finally {
      setBusy(false);
    }
  }

  async function disposition(action: "save" | "pass") {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/items/${itemId}/${action}`, { method: "POST" }).catch(() => {});
      setNote(action === "save" ? "Saved." : "Passed — I'll steer away from this.");
      if (action === "pass") router.push("/radar");
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <p style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: gold, marginBottom: 8 }}>
        FINDS
      </p>
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 30,
          fontStyle: "italic",
          color: "var(--text-primary)",
          lineHeight: 1.15,
          marginBottom: 10,
        }}
      >
        {dossier.mission_title}
      </h1>
      {dossier.why_surfaced ? (
        <p style={{ fontSize: 13, color: muted, lineHeight: 1.6, marginBottom: 28 }}>{dossier.why_surfaced}</p>
      ) : null}

      {pick ? (
        <section style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 24 }}>
          <Label>Best pick</Label>
          <p style={{ fontSize: 18, color: "var(--text-primary)", marginBottom: 4 }}>{pick.name}</p>
          <p style={{ fontSize: 13, color: muted, marginBottom: 14 }}>
            {[pick.price, pick.where_to_buy].filter(Boolean).join(" · ") || "—"}
          </p>
          {pick.taste_fit ? <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6, marginBottom: 14 }}>{pick.taste_fit}</p> : null}
          {pick.key_specs.length ? <BulletBlock title="Key specs" items={pick.key_specs} /> : null}
          {pick.pros.length ? <BulletBlock title="Pros" items={pick.pros} /> : null}
          {pick.cons.length ? <BulletBlock title="Cons" items={pick.cons} /> : null}
          {pick.url || pick.where_to_buy ? (
            <a
              href={pick.url ?? `https://www.google.com/search?q=${encodeURIComponent(pick.name)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-block", marginTop: 8, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: gold }}
            >
              Where to buy →
            </a>
          ) : null}
        </section>
      ) : (
        <p style={{ fontSize: 14, color: muted, marginBottom: 24 }}>
          Still sourcing a confident pick — refine below to point me.
        </p>
      )}

      <Alternatives alts={dossier.alternatives} />

      {dossier.avoid.length ? (
        <section style={{ marginBottom: 24 }}>
          <Label>What to avoid</Label>
          <BulletList items={dossier.avoid} />
        </section>
      ) : null}

      {(dossier.buy_if || dossier.skip_if) ? (
        <section style={{ marginBottom: 28 }}>
          <Label>Decision</Label>
          {dossier.buy_if ? <p style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.6 }}>Buy this if {lower(dossier.buy_if)}</p> : null}
          {dossier.skip_if ? <p style={{ fontSize: 14, color: muted, lineHeight: 1.6, marginTop: 4 }}>Skip if {lower(dossier.skip_if)}</p> : null}
        </section>
      ) : null}

      {/* Refine */}
      <section style={{ marginBottom: 24 }}>
        <Label>Refine</Label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {REFINE_PRESETS.map((p) => (
            <button key={p} type="button" disabled={busy} onClick={() => void refine(p)} style={pill()}>
              {p}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={refineText}
          onChange={(e) => setRefineText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void refine(refineText); }}
          placeholder='Or tell me — "more linen", "Common Projects-ish"…'
          style={{
            width: "100%",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 12px",
            color: "var(--text-primary)",
            fontSize: 13,
          }}
        />
      </section>

      <div style={{ display: "flex", gap: 12 }}>
        <button type="button" disabled={busy} onClick={() => void disposition("save")} style={primaryBtn()}>
          Save
        </button>
        <button type="button" disabled={busy} onClick={() => void disposition("pass")} style={ghostBtn()}>
          Pass
        </button>
      </div>
      {note ? <p style={{ fontSize: 12, color: muted, marginTop: 12 }}>{note}</p> : null}
    </div>
  );
}

function Alternatives({ alts }: { alts: ProductDossier["alternatives"] }) {
  const entries: Array<[string, ProductPick]> = [];
  if (alts.premium) entries.push(["Premium", alts.premium]);
  if (alts.budget) entries.push(["Budget", alts.budget]);
  if (alts.different_style) entries.push(["Different style", alts.different_style]);
  if (entries.length === 0) return null;
  return (
    <section style={{ marginBottom: 24 }}>
      <Label>Alternatives</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {entries.map(([tag, p]) => (
          <div key={tag} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: gold }}>{tag}</p>
            <p style={{ fontSize: 14, color: "var(--text-primary)", marginTop: 2 }}>{p.name}</p>
            <p style={{ fontSize: 12, color: muted, marginTop: 2 }}>{[p.price, p.where_to_buy].filter(Boolean).join(" · ")}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function BulletBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: muted, marginBottom: 6 }}>{title}</p>
      <BulletList items={items} />
    </div>
  );
}
function BulletList({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 16 }}>
      {items.map((it, i) => (
        <li key={i} style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6 }}>{it}</li>
      ))}
    </ul>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: gold, marginBottom: 10 }}>{children}</p>;
}
function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1).replace(/\.$/, "") + ".";
}
function pill(): React.CSSProperties {
  return { fontSize: 12, padding: "6px 12px", borderRadius: 999, border: "1px solid var(--border)", color: "var(--text-primary)", background: "transparent" };
}
function primaryBtn(): React.CSSProperties {
  return { flex: 1, padding: "12px", borderRadius: 8, background: "var(--text-primary)", color: "var(--bg)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase" };
}
function ghostBtn(): React.CSSProperties {
  return { flex: 1, padding: "12px", borderRadius: 8, background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase" };
}
