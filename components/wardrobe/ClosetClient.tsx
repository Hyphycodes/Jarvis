"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Closet, ClosetItem } from "@/lib/wardrobe/closet";

const CATEGORY_ORDER: ClosetItem["category"][] = [
  "tops",
  "bottoms",
  "outerwear",
  "shoes",
  "accessories",
  "headwear",
];

const muted = "var(--text-muted)";
const gold = "var(--gold)";

export function ClosetClient({ closet }: { closet: Closet }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"closet" | "questions">("closet");
  const [context, setContext] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [mergeFrom, setMergeFrom] = useState<string | null>(null);

  async function postAction(body: Record<string, unknown>) {
    await fetch("/api/wardrobe/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
    router.refresh();
  }

  async function upload() {
    if (files.length === 0 || uploading) return;
    setUploading(true);
    setStatus(`Reading ${files.length} photo${files.length === 1 ? "" : "s"}…`);
    try {
      const images = await Promise.all(
        files.map(async (f) => ({
          base64: await fileToBase64(f),
          media_type: f.type || "image/jpeg",
        })),
      );
      setStatus("Jarvis is reading your pieces…");
      const res = await fetch("/api/wardrobe/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images, context: context.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        created?: number;
        merged?: number;
        clarifications?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Upload failed");
      setStatus(
        `Added ${data.created ?? 0} new · matched ${data.merged ?? 0} you already own` +
          (data.clarifications ? ` · ${data.clarifications} question${data.clarifications === 1 ? "" : "s"}` : ""),
      );
      setFiles([]);
      if (fileRef.current) fileRef.current.value = "";
      setContext("");
      router.refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const openQuestions = closet.clarifications.length;

  return (
    <div>
      {/* Upload */}
      <section
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 28,
        }}
      >
        <p style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: gold, marginBottom: 10 }}>
          Add to closet
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          style={{ fontSize: 13, color: "var(--text-primary)", marginBottom: 10, width: "100%" }}
        />
        <input
          type="text"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder='Context — e.g. "most are Zara, ignore the floor"'
          style={{
            width: "100%",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 12px",
            color: "var(--text-primary)",
            fontSize: 13,
            marginBottom: 10,
          }}
        />
        <button
          type="button"
          onClick={() => void upload()}
          disabled={uploading || files.length === 0}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: 8,
            background: "var(--text-primary)",
            color: "var(--bg)",
            fontSize: 11,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            opacity: uploading || files.length === 0 ? 0.5 : 1,
          }}
        >
          {uploading ? "Working…" : files.length ? `Add ${files.length} photo${files.length === 1 ? "" : "s"}` : "Choose photos"}
        </button>
        {status ? (
          <p style={{ fontSize: 12, color: muted, marginTop: 10 }}>{status}</p>
        ) : (
          <p style={{ fontSize: 12, color: muted, marginTop: 10 }}>
            Outfit pics, closet shots, or single items — select several at once. Jarvis dedupes repeats.
          </p>
        )}
      </section>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 18, marginBottom: 20, borderBottom: "1px solid var(--border)" }}>
        <TabButton active={tab === "closet"} onClick={() => setTab("closet")} label={`Closet · ${closet.total}`} />
        <TabButton
          active={tab === "questions"}
          onClick={() => setTab("questions")}
          label={openQuestions ? `Questions · ${openQuestions}` : "Questions"}
          dot={openQuestions > 0}
        />
      </div>

      {tab === "closet" ? (
        <ClosetRack closet={closet} mergeFrom={mergeFrom} setMergeFrom={setMergeFrom} postAction={postAction} />
      ) : (
        <Questions closet={closet} postAction={postAction} />
      )}
    </div>
  );
}

function ClosetRack({
  closet,
  mergeFrom,
  setMergeFrom,
  postAction,
}: {
  closet: Closet;
  mergeFrom: string | null;
  setMergeFrom: (id: string | null) => void;
  postAction: (body: Record<string, unknown>) => Promise<void>;
}) {
  if (closet.total === 0) {
    return (
      <p style={{ fontSize: 14, color: muted, lineHeight: 1.6 }}>
        Nothing in your closet yet. Add a few photos above — outfit pics or a shot of your rack — and Jarvis will build it.
      </p>
    );
  }
  return (
    <div>
      {closet.gaps.length > 0 ? (
        <p style={{ fontSize: 12, color: muted, marginBottom: 22 }}>
          <span style={{ color: gold }}>Gaps:</span> {closet.gaps.join(" · ")}
        </p>
      ) : null}

      {CATEGORY_ORDER.map((cat) => {
        const items = closet.byCategory[cat] ?? [];
        if (items.length === 0) return null;
        return (
          <section key={cat} style={{ marginBottom: 30 }}>
            <p style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: gold, marginBottom: 12 }}>
              {cat} · {items.length}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  merging={mergeFrom !== null && mergeFrom !== item.id}
                  isMergeSource={mergeFrom === item.id}
                  onMergeStart={() => setMergeFrom(item.id)}
                  onMergeInto={async () => {
                    if (mergeFrom && mergeFrom !== item.id) {
                      await postAction({ action: "merge_items", keep_id: item.id, merge_id: mergeFrom });
                      setMergeFrom(null);
                    }
                  }}
                  onCancelMerge={() => setMergeFrom(null)}
                  onDelete={() => postAction({ action: "delete_item", item_id: item.id })}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ItemRow({
  item,
  merging,
  isMergeSource,
  onMergeStart,
  onMergeInto,
  onCancelMerge,
  onDelete,
}: {
  item: ClosetItem;
  merging: boolean;
  isMergeSource: boolean;
  onMergeStart: () => void;
  onMergeInto: () => void;
  onCancelMerge: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = [item.color, item.material, item.brand, item.fit_silhouette].filter(Boolean).join(" · ");
  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <p style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.4 }}>
          {item.description}
          {item.needs_clarification ? <span title="Needs clarification" style={{ color: gold }}> ◦</span> : null}
        </p>
        <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
          {item.times_seen >= 3 ? (
            <span style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: gold }}>
              worn {item.times_seen}×
            </span>
          ) : null}
          {merging ? (
            <button type="button" onClick={onMergeInto} style={linkBtn(gold)}>
              merge here
            </button>
          ) : isMergeSource ? (
            <button type="button" onClick={onCancelMerge} style={linkBtn(muted)}>
              cancel
            </button>
          ) : (
            <button type="button" onClick={() => setOpen((v) => !v)} style={linkBtn(muted)}>
              ⋯
            </button>
          )}
        </div>
      </div>
      {meta ? <p style={{ fontSize: 12, color: muted, marginTop: 4 }}>{meta}</p> : null}
      {open && !merging && !isMergeSource ? (
        <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
          <button type="button" onClick={onMergeStart} style={linkBtn(muted)}>
            same as…
          </button>
          <button type="button" onClick={onDelete} style={linkBtn("#E07A6E")}>
            remove
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Questions({
  closet,
  postAction,
}: {
  closet: Closet;
  postAction: (body: Record<string, unknown>) => Promise<void>;
}) {
  if (closet.clarifications.length === 0) {
    return <p style={{ fontSize: 14, color: muted, lineHeight: 1.6 }}>No open questions. Jarvis is confident about your closet.</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {closet.clarifications.map((c) => (
        <ClarificationRow key={c.id} clarification={c} postAction={postAction} />
      ))}
    </div>
  );
}

function ClarificationRow({
  clarification,
  postAction,
}: {
  clarification: Closet["clarifications"][number];
  postAction: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [text, setText] = useState("");
  return (
    <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>
      <p style={{ fontSize: 14, color: "var(--text-primary)", marginBottom: 4 }}>{clarification.question}</p>
      {clarification.item_label ? (
        <p style={{ fontSize: 12, color: muted, marginBottom: 10 }}>{clarification.item_label}</p>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {clarification.options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => postAction({ action: "answer_clarification", clarification_id: clarification.id, answer: opt })}
            style={pill()}
          >
            {opt}
          </button>
        ))}
        {clarification.options.length === 0 ? (
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && text.trim()) {
                void postAction({ action: "answer_clarification", clarification_id: clarification.id, answer: text.trim() });
              }
            }}
            placeholder="Type an answer…"
            style={{
              flex: 1,
              minWidth: 140,
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "8px 10px",
              color: "var(--text-primary)",
              fontSize: 13,
            }}
          />
        ) : null}
        <button
          type="button"
          onClick={() => postAction({ action: "dismiss_clarification", clarification_id: clarification.id })}
          style={linkBtn(muted)}
        >
          skip
        </button>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label, dot }: { active: boolean; onClick: () => void; label: string; dot?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        paddingBottom: 10,
        fontSize: 11,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: active ? "var(--text-primary)" : muted,
        borderBottom: active ? "1px solid var(--gold)" : "1px solid transparent",
      }}
    >
      {label}
      {dot ? <span style={{ color: gold }}> •</span> : null}
    </button>
  );
}

function linkBtn(color: string): React.CSSProperties {
  return { fontSize: 11, letterSpacing: "0.08em", color, background: "transparent" };
}
function pill(): React.CSSProperties {
  return {
    fontSize: 12,
    padding: "6px 12px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    background: "transparent",
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}
