"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductDossier, ProductPick, SourceBrain } from "@/lib/brain/productResearcher";

const muted = "var(--text-muted)";
const gold = "var(--gold)";

const REFINE_PRESETS = ["Nicer", "Darker", "More old-school", "Under $300", "More masculine", "Simpler", "Better quality", "Not Amazon"];

const BRAIN_LABEL: Record<SourceBrain, string> = {
  style: "Style",
  gear: "Gear",
  home: "Home",
  travel: "Travel",
  hosting: "Hosting",
  fitness: "Fitness",
};

export function FindDetail({ itemId, dossier }: { itemId: string; dossier: ProductDossier }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [refineText, setRefineText] = useState("");
  const pick = dossier.best_pick;
  const ready = dossier.research_state === "ready" && Boolean(pick);
  const brainLabel = BRAIN_LABEL[dossier.source_brain] ?? "Finds";

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
      {/* Eyebrow: FINDS · source brain */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: gold }}>Finds</span>
        <span style={{ color: "var(--border)" }}>·</span>
        <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: muted }}>{brainLabel}</span>
        {dossier.subcategory ? (
          <span style={{ fontSize: 11, color: muted }}>· {dossier.subcategory}</span>
        ) : null}
      </div>

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

      {/* Why this surfaced */}
      {dossier.why_surfaced ? (
        <section style={{ marginBottom: 24 }}>
          <Label>Why this surfaced</Label>
          <p style={{ fontSize: 13, color: muted, lineHeight: 1.6 }}>{dossier.why_surfaced}</p>
        </section>
      ) : null}

      {ready && pick ? (
        <BestPick pick={pick} />
      ) : (
        <ResearchingState />
      )}

      {ready ? <Alternatives alts={dossier.alternatives} /> : null}

      {ready && (dossier.buy_if || dossier.skip_if) ? (
        <section style={{ marginBottom: 28 }}>
          <Label>Decision note</Label>
          {dossier.buy_if ? <p style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.6 }}>Buy this if {lower(dossier.buy_if)}</p> : null}
          {dossier.skip_if ? <p style={{ fontSize: 14, color: muted, lineHeight: 1.6, marginTop: 4 }}>Skip if {lower(dossier.skip_if)}</p> : null}
        </section>
      ) : null}

      {ready && dossier.avoid.length ? (
        <section style={{ marginBottom: 24 }}>
          <Label>What to avoid</Label>
          <BulletList items={dossier.avoid} />
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
          placeholder='Or tell me — "more linen", "real leather", "Italian made"…'
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
          Save Find
        </button>
        <button type="button" disabled={busy} onClick={() => void disposition("pass")} style={ghostBtn()}>
          Pass
        </button>
      </div>
      {note ? <p style={{ fontSize: 12, color: muted, marginTop: 12 }}>{note}</p> : null}
    </div>
  );
}

// ── Best pick (tactile hero) ─────────────────────────────────────────────────

function BestPick({ pick }: { pick: ProductPick }) {
  const buyUrl = pick.product_url ?? null;
  const caveat = pick.cons[0] ?? null;
  return (
    <section style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", marginBottom: 24 }}>
      {pick.image_url ? (
        <ClickableImage url={buyUrl} src={pick.image_url} alt={pick.name} tall />
      ) : null}
      <div style={{ padding: 18 }}>
        <Label>Best pick</Label>
        <ProductTitle name={pick.name} url={buyUrl} size={19} />
        <p style={{ fontSize: 13, color: muted, margin: "4px 0 2px" }}>
          {[pick.brand, pick.retailer].filter(Boolean).join(" · ") || "—"}
        </p>
        <p style={{ fontSize: 15, color: "var(--text-primary)", marginBottom: 4 }}>
          {pick.price ?? "Price pending"}
          {pick.rating != null ? <span style={{ fontSize: 12, color: muted }}>  ·  ★ {pick.rating}</span> : null}
        </p>
        {pick.taste_fit ? (
          <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6, margin: "10px 0 4px" }}>
            {pick.taste_fit}
          </p>
        ) : null}

        {pick.key_specs.length ? <BulletBlock title="Key specs" items={pick.key_specs} /> : null}

        {(pick.pros.length || pick.cons.length) ? (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: muted, marginBottom: 6 }}>Tradeoffs</p>
            {pick.pros.map((p, i) => (
              <p key={`pro-${i}`} style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6 }}>+ {p}</p>
            ))}
            {pick.cons.map((c, i) => (
              <p key={`con-${i}`} style={{ fontSize: 13, color: muted, lineHeight: 1.6 }}>– {c}</p>
            ))}
          </div>
        ) : null}

        {caveat ? (
          <p style={{ fontSize: 12, color: muted, marginTop: 10, fontStyle: "italic" }}>Heads up: {lower(caveat)}</p>
        ) : null}

        <div style={{ marginTop: 14 }}>
          {buyUrl ? (
            <a href={buyUrl} target="_blank" rel="noopener noreferrer" style={buyBtn()}>
              {pick.url_is_fallback ? "View source (brand page)" : "Buy / View source"} →
            </a>
          ) : (
            <span style={{ fontSize: 12, color: muted }}>No direct link yet — refine to source one.</span>
          )}
        </div>
      </div>
    </section>
  );
}

function ResearchingState() {
  return (
    <section
      style={{
        border: "1px dashed var(--border)",
        borderRadius: 14,
        padding: 20,
        marginBottom: 24,
        background: "rgba(255,255,255,0.015)",
      }}
    >
      <p style={{ fontSize: 13, color: gold, letterSpacing: "0.06em", marginBottom: 6 }}>Researching sources…</p>
      <p style={{ fontSize: 13, color: muted, lineHeight: 1.6 }}>
        I&apos;m sourcing real products with prices and links. This fills in shortly — or refine below to point me.
      </p>
    </section>
  );
}

// ── Alternatives (clickable) ─────────────────────────────────────────────────

function Alternatives({ alts }: { alts: ProductDossier["alternatives"] }) {
  const entries: Array<[string, ProductPick]> = [];
  if (alts.premium) entries.push(["Premium", alts.premium]);
  if (alts.budget) entries.push(["Budget", alts.budget]);
  if (alts.different_style) entries.push(["Different style", alts.different_style]);
  if (entries.length === 0) return null;
  return (
    <section style={{ marginBottom: 24 }}>
      <Label>Alternatives</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {entries.map(([tag, p]) => {
          const url = p.product_url ?? null;
          return (
            <div key={tag} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              {p.image_url ? (
                <ClickableImage url={url} src={p.image_url} alt={p.name} thumb />
              ) : null}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: gold }}>{tag}</p>
                <ProductTitle name={p.name} url={url} size={14} />
                <p style={{ fontSize: 12, color: muted, marginTop: 2 }}>{[p.brand, p.retailer, p.price].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Tactile primitives ───────────────────────────────────────────────────────

function ClickableImage({ url, src, alt, tall, thumb }: { url: string | null; src: string; alt: string; tall?: boolean; thumb?: boolean }) {
  const dims: React.CSSProperties = thumb
    ? { width: 64, height: 64, borderRadius: 8, flexShrink: 0 }
    : { width: "100%", height: tall ? 320 : 200, display: "block" };
  const img = <img src={src} alt={alt} style={{ ...dims, objectFit: "cover", background: "rgba(255,255,255,0.03)" }} />;
  if (!url) return img;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: thumb ? "block" : "block", lineHeight: 0 }} aria-label={`Open ${alt}`}>
      {img}
    </a>
  );
}

function ProductTitle({ name, url, size }: { name: string; url: string | null; size: number }) {
  const style: React.CSSProperties = { fontSize: size, color: "var(--text-primary)", lineHeight: 1.3, margin: 0 };
  if (!url) return <p style={style}>{name}</p>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...style, textDecoration: "none", display: "block" }}>
      {name}
    </a>
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
function buyBtn(): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "11px 18px",
    borderRadius: 999,
    background: gold,
    color: "#1a1712",
    fontSize: 11,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    textDecoration: "none",
    fontWeight: 600,
  };
}
function primaryBtn(): React.CSSProperties {
  return { flex: 1, padding: "12px", borderRadius: 8, background: "var(--text-primary)", color: "var(--bg)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase" };
}
function ghostBtn(): React.CSSProperties {
  return { flex: 1, padding: "12px", borderRadius: 8, background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase" };
}
