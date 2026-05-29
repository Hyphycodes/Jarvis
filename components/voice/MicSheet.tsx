"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic } from "@/components/icons";
import type { IntentResult } from "@/lib/brain/intentClassifier";

// ── Types ────────────────────────────────────────────────────────────────────

type SheetState =
  | "idle"
  | "recording"
  | "transcribing"
  | "thinking"
  | "responding";

type Message = {
  role: "user" | "jarvis";
  content: string;
  timestamp: Date;
};

type PlanCard = {
  place_name: string;
  date_hint: string | null;
  occasion_type: string | null;
};

const VOICE_PREF_KEY = "jarvis_voice_output";

// ── Helpers ───────────────────────────────────────────────────────────────────

function readVoicePref(): boolean {
  try {
    return localStorage.getItem(VOICE_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

function saveVoicePref(on: boolean) {
  try {
    localStorage.setItem(VOICE_PREF_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

async function playAudioBuffer(buffer: ArrayBuffer) {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(buffer);
  const source = ctx.createBufferSource();
  source.buffer = decoded;
  source.connect(ctx.destination);
  source.start(0);
  return new Promise<void>((resolve) => {
    source.onended = () => { ctx.close(); resolve(); };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MicSheet({
  open,
  onClose,
  onMicDown,
  onMicUp,
}: {
  open: boolean;
  onClose: () => void;
  /** Fired when the in-sheet mic button is pressed. Parent can also call this. */
  onMicDown?: () => void;
  onMicUp?: () => void;
}) {
  const router = useRouter();

  const [state, setState] = useState<SheetState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentResponse, setCurrentResponse] = useState("");
  const [voiceOn, setVoiceOn] = useState(false);
  const [planCard, setPlanCard] = useState<PlanCard | null>(null);
  const [textInput, setTextInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Restore voice preference on mount
  useEffect(() => {
    setVoiceOn(readVoicePref());
  }, []);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentResponse]);

  // Reset when sheet closes
  useEffect(() => {
    if (!open) {
      stopRecording();
      setState("idle");
      setCurrentResponse("");
      setError(null);
      setPlanCard(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Recording ───────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        void handleTranscribe(blob);
      };

      recorder.start(100); // collect in 100ms chunks
      mediaRecorderRef.current = recorder;
      setState("recording");
    } catch {
      setError("Microphone access denied.");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      mediaRecorderRef.current = null;
    }
  }, []);

  // ── Transcription ───────────────────────────────────────────────────────────

  const handleTranscribe = useCallback(async (blob: Blob) => {
    setState("transcribing");
    setError(null);
    try {
      const form = new FormData();
      form.append("audio", blob);
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
      const data = (await res.json()) as { ok: boolean; text?: string; error?: string };

      if (!data.ok || !data.text) {
        setError(data.error ?? "Didn't catch that. Try again.");
        setState("idle");
        return;
      }

      await handleSendMessage(data.text);
    } catch {
      setError("Transcription failed. Try typing instead.");
      setState("idle");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send message to brain ───────────────────────────────────────────────────

  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim() || state === "thinking" || state === "responding") return;

    const userMessage: Message = { role: "user", content: text.trim(), timestamp: new Date() };
    setMessages((prev) => [...prev, userMessage]);
    setTextInput("");
    setState("thinking");
    setCurrentResponse("");
    setPlanCard(null);
    setError(null);

    const history = [...messages, userMessage].map((m) => ({
      role: m.role as "user" | "jarvis",
      content: m.content,
    }));

    try {
      const res = await fetch("/api/voice/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), history }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Brain request failed");
      }

      setState("responding");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

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
              plan_context?: IntentResult["plan_context"];
              message?: string;
            };

            if (event.type === "token" && event.text) {
              accumulated += event.text;
              setCurrentResponse(accumulated);
            } else if (event.type === "intent") {
              if (event.ask_about_plan && event.plan_context?.place_name) {
                setPlanCard({
                  place_name: event.plan_context.place_name,
                  date_hint: event.plan_context.date_hint ?? null,
                  occasion_type: event.plan_context.occasion_type ?? null,
                });
              }
            } else if (event.type === "done") {
              // Commit the full response to message history
              if (accumulated) {
                const jarvisMsg: Message = {
                  role: "jarvis",
                  content: accumulated,
                  timestamp: new Date(),
                };
                setMessages((prev) => [...prev, jarvisMsg]);
                setCurrentResponse("");

                // Voice playback if enabled
                if (voiceOn && accumulated) {
                  void playJarvisVoice(accumulated);
                }
              }
              setState("idle");
            } else if (event.type === "error") {
              setError(event.message ?? "Something went wrong.");
              setState("idle");
            }
          } catch {
            /* malformed SSE line — skip */
          }
        }
      }

      // Flush anything remaining
      if (accumulated && currentResponse === accumulated) {
        const jarvisMsg: Message = { role: "jarvis", content: accumulated, timestamp: new Date() };
        setMessages((prev) => {
          if (prev[prev.length - 1]?.role === "jarvis") return prev;
          return [...prev, jarvisMsg];
        });
        setCurrentResponse("");
        setState("idle");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("idle");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, state, voiceOn]);

  // ── Voice playback ──────────────────────────────────────────────────────────

  const playJarvisVoice = useCallback(async (text: string) => {
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const buffer = await res.arrayBuffer();
      await playAudioBuffer(buffer);
    } catch {
      /* best-effort */
    }
  }, []);

  // ── Voice toggle ────────────────────────────────────────────────────────────

  const toggleVoice = useCallback(() => {
    setVoiceOn((prev) => {
      saveVoicePref(!prev);
      return !prev;
    });
  }, []);

  // ── Plan card actions ───────────────────────────────────────────────────────

  const handleBuildPlan = useCallback(() => {
    if (!planCard) return;
    // Navigate to plan generation — carry the place + date as query params
    const params = new URLSearchParams();
    params.set("place", planCard.place_name);
    if (planCard.date_hint) params.set("date", planCard.date_hint);
    if (planCard.occasion_type) params.set("occasion", planCard.occasion_type);
    onClose();
    router.push(`/plan/new?${params.toString()}`);
  }, [planCard, onClose, router]);

  // ── Mic button handlers (exposed for parent to call too) ────────────────────

  const handleMicDown = useCallback(() => {
    onMicDown?.();
    void startRecording();
  }, [onMicDown, startRecording]);

  const handleMicUp = useCallback(() => {
    onMicUp?.();
    stopRecording();
  }, [onMicUp, stopRecording]);

  // ── Text submit ─────────────────────────────────────────────────────────────

  const handleTextSubmit = useCallback(() => {
    const txt = textInput.trim();
    if (!txt) return;
    void handleSendMessage(txt);
  }, [textInput, handleSendMessage]);

  // ── Status label ────────────────────────────────────────────────────────────

  const statusLabel =
    state === "recording"
      ? "Listening…"
      : state === "transcribing"
        ? "Transcribing…"
        : state === "thinking"
          ? "Thinking…"
          : state === "responding"
            ? null
            : null;

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
          height: "72dvh",
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
            {/* Voice toggle */}
            <button
              type="button"
              aria-label={voiceOn ? "Voice output on" : "Voice output off"}
              onClick={toggleVoice}
              className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
              style={{
                border: "1px solid rgba(246,239,221,0.15)",
                color: voiceOn ? "var(--gold)" : "rgba(246,239,221,0.3)",
                background: voiceOn ? "rgba(208,173,104,0.08)" : "transparent",
              }}
            >
              <SpeakerIcon on={voiceOn} />
            </button>
            {/* Close */}
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
                Hold the mic or type to start.
              </p>
            </div>
          ) : null}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`mb-5 ${msg.role === "user" ? "text-right" : "text-left"}`}
            >
              {msg.role === "jarvis" ? (
                <span className="mr-2 text-[10px] uppercase tracking-[0.16em] text-muted-gold/60">
                  J.
                </span>
              ) : null}
              <span
                className="text-[15px] leading-[1.6]"
                style={{
                  color: msg.role === "user"
                    ? "rgba(246,239,221,0.55)"
                    : "rgba(246,239,221,0.88)",
                }}
              >
                {msg.content}
              </span>
            </div>
          ))}

          {/* Streaming response in progress */}
          {currentResponse ? (
            <div className="mb-5 text-left">
              <span className="mr-2 text-[10px] uppercase tracking-[0.16em] text-muted-gold/60">
                J.
              </span>
              <span className="text-[15px] leading-[1.6] text-warm-ivory/88">
                {currentResponse}
                <span
                  aria-hidden
                  className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-muted-gold/60"
                />
              </span>
            </div>
          ) : null}

          {/* Status label (recording/transcribing/thinking) */}
          {statusLabel ? (
            <div className="mb-5 text-left">
              <span className="mr-2 text-[10px] uppercase tracking-[0.16em] text-muted-gold/60">
                J.
              </span>
              <span className="animate-pulse text-[14px] text-warm-ivory/35">
                {statusLabel}
              </span>
            </div>
          ) : null}

          {/* Error */}
          {error ? (
            <div className="mb-4 text-[13px] text-[#E07A6E]/80">{error}</div>
          ) : null}

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
                {planCard.place_name}
                {planCard.date_hint ? ` · ${planCard.date_hint}` : ""}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleBuildPlan}
                  className="lux-action rounded-full px-4 py-1.5 text-[11px] uppercase tracking-[0.16em]"
                >
                  Yes, build it
                </button>
                <button
                  type="button"
                  onClick={() => setPlanCard(null)}
                  className="text-[12px] text-warm-ivory/35 hover:text-warm-ivory/60"
                >
                  Not yet
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Input row */}
        <div
          className="flex shrink-0 items-center gap-3 px-4 py-3"
          style={{ borderTop: "1px solid rgba(246,239,221,0.07)" }}
        >
          <input
            ref={textInputRef}
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleTextSubmit();
              }
            }}
            placeholder="Type or hold mic…"
            disabled={state === "thinking" || state === "responding"}
            className="flex-1 bg-transparent text-[14px] text-warm-ivory/88 placeholder:text-warm-ivory/25 focus:outline-none disabled:opacity-40"
          />

          {/* Send button (visible when text is present) */}
          {textInput.trim() ? (
            <button
              type="button"
              onClick={handleTextSubmit}
              disabled={state === "thinking" || state === "responding"}
              className="shrink-0 text-[12px] uppercase tracking-[0.16em] text-muted-gold/70 hover:text-muted-gold disabled:opacity-40"
            >
              Send
            </button>
          ) : null}

          {/* Mic button */}
          <button
            type="button"
            aria-label="Hold to record"
            onPointerDown={(e) => { e.preventDefault(); handleMicDown(); }}
            onPointerUp={handleMicUp}
            onPointerLeave={handleMicUp}
            disabled={state === "transcribing" || state === "thinking" || state === "responding"}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-150 active:scale-90 disabled:opacity-40"
            style={{
              border: state === "recording"
                ? "1.5px solid rgba(208,173,104,0.9)"
                : "1.5px solid rgba(208,173,104,0.55)",
              background: state === "recording"
                ? "rgba(208,173,104,0.12)"
                : "rgba(184,137,55,0.035)",
              color: "var(--gold)",
              boxShadow: state === "recording"
                ? "0 0 0 4px rgba(208,173,104,0.12)"
                : "none",
            }}
          >
            <Mic size={15} />
          </button>
        </div>
      </div>
    </>
  );
}

// ── Speaker icon ──────────────────────────────────────────────────────────────

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
