"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Mic } from "@/components/icons";
import type { IntentResult } from "@/lib/brain/intentClassifier";
import { useRealtimeVoice } from "@/lib/voice/useRealtimeVoice";
import { buildSheetContext } from "@/lib/voice/buildSheetContext";

// ── Types ────────────────────────────────────────────────────────────────────

type SheetState = "idle" | "listening" | "thinking" | "responding";

type Message = {
  role: "user" | "jarvis";
  content: string;
  timestamp: number;
  chips?: string[];
};

type PlanCard = {
  place_name: string;
  date_hint: string | null;
  occasion_type: string | null;
};

type AttachmentContext = {
  label: string;
  context: string;
};

type AttachmentTrayMode = "closed" | "place" | "link" | "photo";

const VOICE_PREF_KEY = "jarvis_voice_output";
const SESSION_KEY = "jarvis_session";
const SESSION_TTL_MS = 30 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function readVoicePref(): boolean {
  try { return localStorage.getItem(VOICE_PREF_KEY) === "1"; } catch { return false; }
}
function saveVoicePref(on: boolean) {
  try { localStorage.setItem(VOICE_PREF_KEY, on ? "1" : "0"); } catch { /* noop */ }
}

function saveSession(messages: Message[]) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ messages, savedAt: Date.now() }));
  } catch { /* noop */ }
}

function loadSession(): Message[] | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const { messages, savedAt } = JSON.parse(raw) as { messages: Message[]; savedAt: number };
    if (Date.now() - savedAt > SESSION_TTL_MS) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return messages;
  } catch { return null; }
}

async function playAudioBuffer(buffer: ArrayBuffer) {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(buffer);
  const source = ctx.createBufferSource();
  source.buffer = decoded;
  source.connect(ctx.destination);
  source.start(0);
  return new Promise<void>((resolve) => { source.onended = () => { ctx.close(); resolve(); }; });
}

function haptic(pattern?: number | number[]) {
  try { navigator.vibrate(pattern ?? 10); } catch { /* noop */ }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MicSheet({
  open,
  onClose,
  startListening = false,
  visibleItem,
  tonightEvents,
}: {
  open: boolean;
  onClose: () => void;
  /** If true, start recording immediately when sheet opens (hold-mic behavior) */
  startListening?: boolean;
  visibleItem?: { name: string; type: string; slug: string; verdict_snippet?: string };
  tonightEvents?: { name: string; starts_at: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [state, setState] = useState<SheetState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentResponse, setCurrentResponse] = useState("");
  const [voiceOn, setVoiceOn] = useState(false);
  const [planCard, setPlanCard] = useState<PlanCard | null>(null);
  const [textInput, setTextInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<AttachmentContext | null>(null);
  const [trayMode, setTrayMode] = useState<AttachmentTrayMode>("closed");
  const [placeQuery, setPlaceQuery] = useState("");
  const [linkInput, setLinkInput] = useState("");
  const [trayLoading, setTrayLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const didRestoreRef = useRef(false);
  const startListeningFiredRef = useRef(false);

  // ── Realtime voice hook ─────────────────────────────────────────────────────

  const handleTranscript = useCallback((text: string, final: boolean) => {
    if (final) {
      setTextInput("");
      void handleSendMessage(text);
    } else {
      setTextInput(text);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { start: rtStart, stop: rtStop, isListening } = useRealtimeVoice(handleTranscript);

  // ── Init on mount ───────────────────────────────────────────────────────────

  useEffect(() => {
    setVoiceOn(readVoicePref());
  }, []);

  // Restore session on first open
  useEffect(() => {
    if (open && !didRestoreRef.current) {
      didRestoreRef.current = true;
      const saved = loadSession();
      if (saved && saved.length > 0) setMessages(saved);
    }
  }, [open]);

  // Auto-start listening if opened via hold
  useEffect(() => {
    if (open && startListening && !startListeningFiredRef.current) {
      startListeningFiredRef.current = true;
      void handleToggleMic();
    }
    if (!open) {
      startListeningFiredRef.current = false;
    }
  }, [open, startListening]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save session on close
  useEffect(() => {
    if (!open) {
      if (messages.length > 0) saveSession(messages);
      if (isListening) rtStop();
      setState("idle");
      setCurrentResponse("");
      setError(null);
      setPlanCard(null);
      setTrayMode("closed");
      setAttachment(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentResponse]);

  // Sync state with isListening
  useEffect(() => {
    if (isListening) {
      setState("listening");
    } else if (state === "listening") {
      setState("thinking");
    }
  }, [isListening]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mic toggle ──────────────────────────────────────────────────────────────

  const handleToggleMic = useCallback(async () => {
    if (isListening) {
      rtStop();
      setState("thinking");
    } else if (state === "idle") {
      haptic(10);
      await rtStart();
    }
  }, [isListening, state, rtStart, rtStop]);

  // ── Send message ────────────────────────────────────────────────────────────

  const handleSendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || state === "thinking" || state === "responding") return;

    haptic([10, 50, 10]);
    const userMessage: Message = { role: "user", content: trimmed, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMessage]);
    setTextInput("");
    setState("thinking");
    setCurrentResponse("");
    setPlanCard(null);
    setError(null);

    const historyForApi = [...messages, userMessage].map((m) => ({
      role: m.role as "user" | "jarvis",
      content: m.content,
    }));

    // Build sheet context silently
    const sheetContext = buildSheetContext({ currentRoute: pathname, visibleItem, tonightEvents });

    // Attachment context
    const messageWithAttachment = attachment
      ? `${trimmed}\n\n[Attached: ${attachment.label}]\n${attachment.context}`
      : trimmed;

    setAttachment(null);

    try {
      const res = await fetch("/api/voice/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: messageWithAttachment,
          history: historyForApi,
          sheet_context: sheetContext || undefined,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Brain request failed");

      setState("responding");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";
      let intentChips: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const event = JSON.parse(raw) as {
              type: string;
              text?: string;
              intent?: string;
              ask_about_plan?: boolean;
              chips?: string[];
              plan_context?: IntentResult["plan_context"];
              message?: string;
            };

            if (event.type === "token" && event.text) {
              accumulated += event.text;
              setCurrentResponse(accumulated);
            } else if (event.type === "intent") {
              intentChips = Array.isArray(event.chips) ? event.chips : [];
              if (event.ask_about_plan && event.plan_context?.place_name) {
                setPlanCard({
                  place_name: event.plan_context.place_name,
                  date_hint: event.plan_context.date_hint ?? null,
                  occasion_type: event.plan_context.occasion_type ?? null,
                });
              }
            } else if (event.type === "done") {
              if (accumulated) {
                const jarvisMsg: Message = {
                  role: "jarvis",
                  content: accumulated,
                  timestamp: Date.now(),
                  chips: intentChips.length > 0 ? intentChips : undefined,
                };
                setMessages((prev) => [...prev, jarvisMsg]);
                setCurrentResponse("");
                if (voiceOn) void playJarvisVoice(accumulated);
              }
              setState("idle");
            } else if (event.type === "error") {
              setError(event.message ?? "Something went wrong.");
              setState("idle");
            }
          } catch { /* malformed SSE */ }
        }
      }

      if (accumulated && !messages.find((m) => m.content === accumulated)) {
        setMessages((prev) => {
          if (prev[prev.length - 1]?.role === "jarvis") return prev;
          return [...prev, { role: "jarvis", content: accumulated, timestamp: Date.now(), chips: intentChips.length > 0 ? intentChips : undefined }];
        });
        setCurrentResponse("");
        setState("idle");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("idle");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, state, voiceOn, pathname, visibleItem, tonightEvents, attachment]);

  const handleTextSubmit = useCallback(() => {
    const txt = textInput.trim();
    if (!txt) return;
    void handleSendMessage(txt);
  }, [textInput, handleSendMessage]);

  // ── Voice playback ──────────────────────────────────────────────────────────

  const playJarvisVoice = useCallback(async (text: string) => {
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      await playAudioBuffer(await res.arrayBuffer());
    } catch { /* best-effort */ }
  }, []);

  // ── Plan card ───────────────────────────────────────────────────────────────

  const handleBuildPlan = useCallback(() => {
    if (!planCard) return;
    const params = new URLSearchParams();
    params.set("place", planCard.place_name);
    if (planCard.date_hint) params.set("date", planCard.date_hint);
    if (planCard.occasion_type) params.set("occasion", planCard.occasion_type);
    onClose();
    router.push(`/plan/new?${params.toString()}`);
  }, [planCard, onClose, router]);

  // ── Attachment tray ─────────────────────────────────────────────────────────

  const handleLinkAttach = useCallback(async () => {
    const url = linkInput.trim();
    if (!url) return;
    setTrayLoading(true);
    try {
      const res = await fetch("/api/voice/fetch-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as { ok?: boolean; title?: string; context?: string };
      if (data.ok && data.context) {
        setAttachment({ label: data.title ?? url, context: data.context });
      }
    } catch { /* noop */ }
    setLinkInput("");
    setTrayMode("closed");
    setTrayLoading(false);
  }, [linkInput]);

  const handlePhotoAttach = useCallback(async (file: File) => {
    setTrayLoading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/voice/analyze-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: base64, image_media_type: file.type || "image/jpeg" }),
      });
      const data = (await res.json()) as { ok?: boolean; description?: string; context?: string };
      if (data.ok && data.context) {
        setAttachment({ label: data.description ?? "Photo", context: data.context });
      }
    } catch { /* noop */ }
    setTrayMode("closed");
    setTrayLoading(false);
  }, []);

  // Google Places inline search (server-side via /api/)
  const [placeResults, setPlaceResults] = useState<Array<{ name: string; address: string; placeId: string }>>([]);
  const placeSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePlaceQuery = useCallback((q: string) => {
    setPlaceQuery(q);
    if (placeSearchTimeout.current) clearTimeout(placeSearchTimeout.current);
    if (!q.trim()) { setPlaceResults([]); return; }
    placeSearchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { results?: Array<{ name: string; address: string; place_id: string }> };
        setPlaceResults((data.results ?? []).slice(0, 5).map((r) => ({
          name: r.name,
          address: r.address,
          placeId: r.place_id,
        })));
      } catch { setPlaceResults([]); }
    }, 350);
  }, []);

  const handlePlaceSelect = useCallback((place: { name: string; address: string }) => {
    setAttachment({
      label: place.name,
      context: `User attached place: ${place.name}, ${place.address}.`,
    });
    setPlaceQuery("");
    setPlaceResults([]);
    setTrayMode("closed");
  }, []);

  // ── Status ──────────────────────────────────────────────────────────────────

  const busy = state === "thinking" || state === "responding";
  const statusLabel =
    state === "listening" ? "Listening…" :
    state === "thinking" ? "Thinking…" :
    null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-40 transition-opacity duration-300 ease-atmospheric"
        style={{
          background: "rgba(0,0,0,0.55)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-label="Jarvis"
        aria-modal
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[440px] flex-col"
        style={{
          height: "76dvh",
          background: "#0a0a09",
          borderTop: "1px solid rgba(246,239,221,0.1)",
          borderRadius: "20px 20px 0 0",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.32s cubic-bezier(0.32,0.72,0,1)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* Header */}
        <div
          className="flex shrink-0 items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(246,239,221,0.07)" }}
        >
          <span className="text-[11px] uppercase tracking-[0.22em] text-warm-ivory/50">
            Jarvis
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label={voiceOn ? "Voice on" : "Voice off"}
              onClick={() => { const next = !voiceOn; setVoiceOn(next); saveVoicePref(next); }}
              className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
              style={{
                border: "1px solid rgba(246,239,221,0.15)",
                color: voiceOn ? "var(--gold)" : "rgba(246,239,221,0.3)",
                background: voiceOn ? "rgba(208,173,104,0.08)" : "transparent",
              }}
            >
              <SpeakerIcon on={voiceOn} />
            </button>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="text-[20px] leading-none text-warm-ivory/30 hover:text-warm-ivory/60"
            >
              ×
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4" data-no-embla-drag>
          {messages.length === 0 && !currentResponse && !statusLabel ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-[14px] text-warm-ivory/25">
                Tap mic or type to start.
              </p>
            </div>
          ) : null}

          {messages.map((msg, i) => (
            <div key={i} className={`mb-5 ${msg.role === "user" ? "text-right" : "text-left"}`}>
              {msg.role === "jarvis" ? (
                <div>
                  <div className="text-left">
                    <span className="mr-2 text-[10px] uppercase tracking-[0.16em] text-muted-gold/60">J.</span>
                    <span className="text-[15px] leading-[1.6] text-warm-ivory/88">{msg.content}</span>
                  </div>
                  {msg.chips && msg.chips.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {msg.chips.map((chip) => (
                        <ChipButton
                          key={chip}
                          label={chip}
                          disabled={busy}
                          onClick={() => void handleSendMessage(chip)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <span className="text-[15px] leading-[1.6] text-warm-ivory/45">{msg.content}</span>
              )}
            </div>
          ))}

          {/* Streaming response */}
          {currentResponse ? (
            <div className="mb-5 text-left">
              <span className="mr-2 text-[10px] uppercase tracking-[0.16em] text-muted-gold/60">J.</span>
              <span className="text-[15px] leading-[1.6] text-warm-ivory/88">
                {currentResponse}
                <span aria-hidden className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-muted-gold/60" />
              </span>
            </div>
          ) : null}

          {/* Status */}
          {statusLabel ? (
            <div className="mb-5 text-left">
              <span className="mr-2 text-[10px] uppercase tracking-[0.16em] text-muted-gold/60">J.</span>
              <span className="animate-pulse text-[14px] text-warm-ivory/35">{statusLabel}</span>
            </div>
          ) : null}

          {error ? <div className="mb-4 text-[13px] text-[#E07A6E]/80">{error}</div> : null}

          <div ref={messagesEndRef} />
        </div>

        {/* Plan card */}
        {planCard ? (
          <div
            className="mx-5 mb-3 rounded-[var(--radius-soft)]"
            style={{ border: "1px solid rgba(208,173,104,0.25)", background: "rgba(208,173,104,0.04)" }}
          >
            <div className="px-4 py-3">
              <div className="text-[12px] text-warm-ivory/50">Build a plan for this?</div>
              <div className="mt-0.5 text-[15px] text-warm-ivory/88">
                {planCard.place_name}{planCard.date_hint ? ` · ${planCard.date_hint}` : ""}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button type="button" onClick={handleBuildPlan} className="lux-action rounded-full px-4 py-1.5 text-[11px] uppercase tracking-[0.16em]">Yes, build it</button>
                <button type="button" onClick={() => setPlanCard(null)} className="text-[12px] text-warm-ivory/35 hover:text-warm-ivory/60">Not yet</button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Attachment preview */}
        {attachment ? (
          <div className="mx-5 mb-2 flex items-center justify-between rounded-[var(--radius-soft)] border border-white/[0.08] bg-white/[0.025] px-3 py-2">
            <span className="text-[12px] text-warm-ivory/60 truncate">{attachment.label}</span>
            <button type="button" onClick={() => setAttachment(null)} className="ml-2 shrink-0 text-[11px] text-warm-ivory/35 hover:text-warm-ivory/60">✕</button>
          </div>
        ) : null}

        {/* Attachment tray */}
        {trayMode !== "closed" ? (
          <div
            className="mx-4 mb-2 rounded-[var(--radius-soft)] border border-white/[0.07] bg-[#0c0c0b] px-4 py-3"
            style={{ animation: "cross-fade 150ms ease" }}
          >
            {trayMode === "place" ? (
              <div className="flex flex-col gap-2">
                <input
                  autoFocus
                  type="text"
                  value={placeQuery}
                  onChange={(e) => handlePlaceQuery(e.target.value)}
                  placeholder="Search a place…"
                  className="w-full bg-transparent text-[14px] text-warm-ivory/88 placeholder:text-warm-ivory/25 focus:outline-none"
                />
                {placeResults.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {placeResults.map((p) => (
                      <li key={p.placeId}>
                        <button type="button" onClick={() => handlePlaceSelect(p)} className="w-full text-left">
                          <div className="text-[13px] text-warm-ivory/85">{p.name}</div>
                          <div className="text-[11px] text-warm-ivory/40">{p.address}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : trayMode === "link" ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  type="url"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="Paste a URL…"
                  className="flex-1 bg-transparent text-[14px] text-warm-ivory/88 placeholder:text-warm-ivory/25 focus:outline-none"
                  onKeyDown={(e) => { if (e.key === "Enter") void handleLinkAttach(); }}
                />
                <button
                  type="button"
                  onClick={() => void handleLinkAttach()}
                  disabled={trayLoading || !linkInput.trim()}
                  className="text-[11px] uppercase tracking-[0.16em] text-muted-gold/70 disabled:opacity-40"
                >
                  {trayLoading ? "…" : "Attach"}
                </button>
              </div>
            ) : trayMode === "photo" ? (
              <div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handlePhotoAttach(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={trayLoading}
                  className="text-[13px] text-warm-ivory/70 disabled:opacity-40"
                >
                  {trayLoading ? "Analyzing…" : "Choose photo"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Input row */}
        <div
          className="flex shrink-0 flex-col"
          style={{ borderTop: "1px solid rgba(246,239,221,0.07)" }}
        >
          {/* Tray icons row */}
          {trayMode === "closed" ? (
            <div className="flex items-center gap-4 px-5 pt-2 pb-1">
              <TrayButton label="📍 Place" onClick={() => setTrayMode("place")} />
              <TrayButton label="🔗 Link" onClick={() => setTrayMode("link")} />
              <TrayButton label="📷 Photo" onClick={() => setTrayMode("photo")} />
            </div>
          ) : (
            <button type="button" onClick={() => setTrayMode("closed")} className="px-5 pt-2 pb-1 text-left text-[11px] text-warm-ivory/35">
              ↓ Close tray
            </button>
          )}

          <div className="flex items-center gap-3 px-4 pb-3 pt-1">
            <input
              ref={textInputRef}
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); }
              }}
              placeholder={isListening ? "Listening…" : "Type or tap mic…"}
              disabled={busy}
              className="flex-1 bg-transparent text-[14px] text-warm-ivory/88 placeholder:text-warm-ivory/25 focus:outline-none disabled:opacity-40"
            />

            {textInput.trim() && !isListening ? (
              <button
                type="button"
                onClick={handleTextSubmit}
                disabled={busy}
                className="shrink-0 text-[12px] uppercase tracking-[0.16em] text-muted-gold/70 hover:text-muted-gold disabled:opacity-40"
              >
                Send
              </button>
            ) : null}

            {/* Mic toggle button */}
            <button
              type="button"
              aria-label={isListening ? "Stop recording" : "Start recording"}
              onClick={() => void handleToggleMic()}
              disabled={busy}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-150 disabled:opacity-40"
              style={{
                border: isListening ? "1.5px solid rgba(208,173,104,0.9)" : "1.5px solid rgba(208,173,104,0.55)",
                background: isListening ? "rgba(208,173,104,0.12)" : "rgba(184,137,55,0.035)",
                color: "var(--gold)",
                boxShadow: isListening ? "0 0 0 6px rgba(208,173,104,0.10), 0 0 14px rgba(208,173,104,0.18)" : "none",
                animation: isListening ? "mic-pulse 1.6s ease-in-out infinite" : "none",
              }}
            >
              <Mic size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Mic pulse animation */}
      <style>{`
        @keyframes mic-pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(208,173,104,0.10); }
          50% { box-shadow: 0 0 0 8px rgba(208,173,104,0.06), 0 0 18px rgba(208,173,104,0.20); }
        }
      `}</style>
    </>
  );
}

// ── Small components ──────────────────────────────────────────────────────────

function ChipButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-white/[0.12] px-3 py-1 text-[11px] text-warm-ivory/60 transition-all duration-150 hover:border-muted-gold/40 hover:text-warm-ivory/90 active:bg-muted-gold/10 disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function TrayButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] text-warm-ivory/40 transition-colors hover:text-warm-ivory/70"
    >
      {label}
    </button>
  );
}

function SpeakerIcon({ on }: { on: boolean }) {
  return on ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}
