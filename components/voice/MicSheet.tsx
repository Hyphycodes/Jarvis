"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Mic } from "@/components/icons";
import type { IntentResult } from "@/lib/brain/intentClassifier";
import type { ChatAttachment, ChatChip } from "@/lib/chat/types";
import { useRealtimeVoice } from "@/lib/voice/useRealtimeVoice";
import { buildSheetContext } from "@/lib/voice/buildSheetContext";

// ── Types ────────────────────────────────────────────────────────────────────

type SheetState = "idle" | "listening" | "thinking" | "responding";

type Message = {
  role: "user" | "jarvis";
  content: string;
  timestamp: number;
  chips?: ChatChip[];
  attachment?: AttachmentContext;
};

type PlanCard = {
  place_name: string;
  date_hint: string | null;
  occasion_type: string | null;
};

type AttachmentContext = {
  type: "image" | "link" | "place" | "text";
  label: string;
  context?: string;
  url?: string;
  imageDataUrl?: string;
  imageBase64?: string;
  imageMediaType?: string;
};

const VOICE_PREF_KEY = "jarvis_voice_output";
const SESSION_KEY = "jarvis_session";
const SESSION_TTL_MS = 30 * 60 * 1000;
const URL_RE = /https?:\/\/[^\s<>"']+/i;

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

function normalizeChips(chips: Array<string | ChatChip> | undefined): ChatChip[] {
  if (!Array.isArray(chips)) return [];
  return chips.slice(0, 5).map((chip) => {
    if (typeof chip === "string") {
      return {
        label: chip,
        message: chip,
        action_type: "send_message" as const,
      };
    }
    return chip;
  });
}

function attachmentForApi(attachment: AttachmentContext): ChatAttachment {
  if (attachment.type === "image" && attachment.imageBase64) {
    return {
      type: "image",
      label: attachment.label,
      image_base64: attachment.imageBase64,
      image_media_type: attachment.imageMediaType,
      preview_url: attachment.imageDataUrl,
    };
  }
  if (attachment.type === "image") {
    return {
      type: "text",
      label: attachment.label,
      context: "Image attachment selected, but image data was unavailable.",
    };
  }
  return {
    type: attachment.type,
    label: attachment.label,
    context: attachment.context,
    url: attachment.url,
  };
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
  const [, setDetectedLinkUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [analyzingImage, setAnalyzingImage] = useState(false);

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

  const handleVoiceError = useCallback((msg: string) => {
    setError(msg);
    setState("idle"); // failed mic attempt must not leave the sheet stuck in "thinking"
  }, []);

  const { start: rtStart, stop: rtStop, release: rtRelease, isListening } = useRealtimeVoice(handleTranscript, handleVoiceError);

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
      rtRelease(); // stop recorder + release the retained mic stream when the sheet closes
      setState("idle");
      setCurrentResponse("");
      setError(null);
      setPlanCard(null);
      setAttachment(null);
      setDetectedLinkUrl(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentResponse]);

  // Sync state with isListening. Only drive "listening" here — the transition
  // to "thinking" is owned by handleSendMessage (real transcript) and the
  // transition to "idle" by handleVoiceError (nothing captured).
  useEffect(() => {
    if (isListening) {
      setState("listening");
    }
  }, [isListening]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mic toggle ──────────────────────────────────────────────────────────────

  const handleToggleMic = useCallback(async () => {
    if (isListening) {
      // Let the transcript/error path own the next state — don't flash "thinking".
      rtStop();
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
    const outgoingAttachment = attachment;
    const userMessage: Message = {
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
      attachment: outgoingAttachment ?? undefined,
    };
    setMessages((prev) => [...prev, userMessage]);
    setTextInput("");
    setDetectedLinkUrl(null);
    setState("thinking");
    setCurrentResponse("");
    setPlanCard(null);
    setError(null);
    setAnalyzingImage(outgoingAttachment?.type === "image");

    const historyForApi = [...messages, userMessage].map((m) => ({
      role: m.role as "user" | "jarvis",
      content: m.content,
    }));

    // Build sheet context silently
    const sheetContext = buildSheetContext({ currentRoute: pathname, visibleItem, tonightEvents });

    // Attachment context
    const messageWithAttachment = outgoingAttachment && outgoingAttachment.type !== "image"
      ? `${trimmed}\n\n[Attached: ${outgoingAttachment.label}]\n${outgoingAttachment.context ?? ""}`
      : trimmed;
    const attachmentsForApi = outgoingAttachment
      ? [attachmentForApi(outgoingAttachment)]
      : [];

    setAttachment(null);

    try {
      const res = await fetch("/api/voice/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: messageWithAttachment,
          history: historyForApi,
          sheet_context: sheetContext || undefined,
          attachments: attachmentsForApi,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Brain request failed");

      setState("responding");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";
      let intentChips: ChatChip[] = [];

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
              chips?: Array<string | ChatChip>;
              plan_context?: IntentResult["plan_context"];
              message?: string;
            };

            if (event.type === "token" && event.text) {
              accumulated += event.text;
              setCurrentResponse(accumulated);
            } else if (event.type === "intent") {
              intentChips = normalizeChips(event.chips);
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
              setAnalyzingImage(false);
            } else if (event.type === "error") {
              setError(event.message ?? "Something went wrong.");
              setState("idle");
              setAnalyzingImage(false);
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
        setAnalyzingImage(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("idle");
      setAnalyzingImage(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, state, voiceOn, pathname, visibleItem, tonightEvents, attachment]);

  const busy = state === "thinking" || state === "responding";

  const detectLinkAttachment = useCallback((value: string) => {
    const url = value.match(URL_RE)?.[0]?.replace(/[),.;!?]+$/, "") ?? null;
    if (!url) {
      setDetectedLinkUrl((current) => {
        if (current) {
          setAttachment((existing) => (
            existing?.type === "link" && existing.url === current ? null : existing
          ));
        }
        return null;
      });
      return;
    }

    setDetectedLinkUrl((current) => {
      if (current === url) return current;
      setAttachment((existing) => {
        if (existing?.type === "image") return existing;
        return {
          type: "link",
          label: url,
          context: `User pasted link: ${url}`,
          url,
        };
      });
      return url;
    });
  }, []);

  const handleTextInputChange = useCallback((value: string) => {
    setTextInput(value);
    detectLinkAttachment(value);
  }, [detectLinkAttachment]);

  const handleTextSubmit = useCallback(() => {
    const txt = textInput.trim();
    if (!txt) return;
    void handleSendMessage(txt);
  }, [textInput, handleSendMessage]);

  const handleChipClick = useCallback(async (chip: ChatChip) => {
    if (busy) return;
    if (chip.action_type === "send_message" || chip.action_type === "find_similar" || chip.action_type === "compare") {
      void handleSendMessage(chip.message);
      return;
    }

    haptic(8);
    const userMessage: Message = {
      role: "user",
      content: chip.message,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setState("thinking");
    setError(null);

    try {
      const res = await fetch("/api/chat/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_type: chip.action_type,
          message: chip.message,
          payload: chip.payload,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        chips?: Array<string | ChatChip>;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Action failed");
      }
      if (data.message) {
        const jarvisMsg: Message = {
          role: "jarvis",
          content: data.message,
          timestamp: Date.now(),
          chips: normalizeChips(data.chips),
        };
        setMessages((prev) => [...prev, jarvisMsg]);
      }
      setState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
      setState("idle");
    }
  }, [busy, handleSendMessage]);

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

  const handlePhotoAttach = useCallback(async (file: File) => {
    setPhotoLoading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1] ?? "";
      setAttachment({
        type: "image",
        label: file.name || "Photo",
        imageDataUrl: dataUrl,
        imageBase64: base64,
        imageMediaType: file.type || "image/jpeg",
      });
    } catch { /* noop */ }
    setPhotoLoading(false);
  }, []);

  // ── Status ──────────────────────────────────────────────────────────────────

  const statusLabel =
    state === "listening" ? "Listening…" :
    state === "thinking" ? (analyzingImage ? "Analyzing…" : "Thinking…") :
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
                          key={`${chip.action_type}-${chip.label}`}
                          label={chip.label}
                          disabled={busy}
                          onClick={() => void handleChipClick(chip)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="inline-flex max-w-[85%] flex-col items-end gap-2">
                  {msg.attachment ? <AttachmentPreview attachment={msg.attachment} compact /> : null}
                  <span className="text-[15px] leading-[1.6] text-warm-ivory/45">{msg.content}</span>
                </div>
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
          <div className="mx-5 mb-2 flex items-center justify-between gap-3 rounded-[var(--radius-soft)] border border-white/[0.08] bg-white/[0.025] px-3 py-2">
            <AttachmentPreview attachment={attachment} />
            <button
              type="button"
              onClick={() => {
                setAttachment(null);
                setDetectedLinkUrl(null);
              }}
              className="ml-2 shrink-0 text-[11px] text-warm-ivory/35 hover:text-warm-ivory/60"
            >
              ✕
            </button>
          </div>
        ) : null}

        {/* Input row */}
        <div
          className="flex shrink-0 flex-col"
          style={{ borderTop: "1px solid rgba(246,239,221,0.07)" }}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handlePhotoAttach(file);
                e.currentTarget.value = "";
              }}
            />
            <button
              type="button"
              aria-label="Attach photo"
              onClick={() => photoInputRef.current?.click()}
              disabled={busy || photoLoading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.12] text-[16px] text-warm-ivory/55 transition-colors hover:border-muted-gold/40 hover:text-warm-ivory/85 disabled:opacity-40"
            >
              {photoLoading ? "…" : "📷"}
            </button>

            <input
              ref={textInputRef}
              type="text"
              value={textInput}
              onChange={(e) => handleTextInputChange(e.target.value)}
              onDrop={(e) => {
                const droppedText = e.dataTransfer.getData("text/plain").trim();
                if (!droppedText) return;
                e.preventDefault();
                const next = textInput ? `${textInput} ${droppedText}` : droppedText;
                handleTextInputChange(next);
                textInputRef.current?.focus();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); }
              }}
              placeholder={isListening ? "Listening…" : "Type or tap mic…"}
              disabled={busy}
              className="flex-1 bg-transparent text-[14px] text-warm-ivory/88 placeholder:text-warm-ivory/25 focus:outline-none disabled:opacity-40"
            />

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

function AttachmentPreview({
  attachment,
  compact = false,
}: {
  attachment: AttachmentContext;
  compact?: boolean;
}) {
  if (attachment.type === "image" && attachment.imageDataUrl) {
    return (
      <div className={`flex items-center gap-2 ${compact ? "justify-end" : "min-w-0 flex-1"}`}>
        <img
          src={attachment.imageDataUrl}
          alt=""
          className={compact ? "h-28 w-28 rounded-md object-cover" : "h-10 w-10 rounded-md object-cover"}
        />
        {!compact ? (
          <span className="truncate text-[12px] text-warm-ivory/60">{attachment.label}</span>
        ) : null}
      </div>
    );
  }

  return (
    <span className={`truncate text-[12px] text-warm-ivory/60 ${compact ? "max-w-[220px]" : "min-w-0 flex-1"}`}>
      {attachment.label}
    </span>
  );
}

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
