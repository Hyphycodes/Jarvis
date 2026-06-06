"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Mic } from "@/components/icons";
import type { IntentResult } from "@/lib/brain/intentClassifier";
import type { ChatAttachment, ChatChip } from "@/lib/chat/types";
import { buildClosetChips } from "@/lib/wardrobe/closetChips";
import { useRealtimeVoice } from "@/lib/voice/useRealtimeVoice";
import { buildSheetContext } from "@/lib/voice/buildSheetContext";
import { usePushSubscription } from "@/lib/push/usePushSubscription";

// ── Types ────────────────────────────────────────────────────────────────────

type SheetState = "idle" | "listening" | "thinking" | "responding";

type Message = {
  role: "user" | "jarvis";
  content: string;
  timestamp: number;
  chips?: ChatChip[];
  attachments?: AttachmentContext[];
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
const PUSH_SUBSCRIBED_KEY = "push_subscribed";
const PUSH_PUBLIC_KEY_AVAILABLE = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
const URL_RE = /https?:\/\/[^\s<>"']+/i;

// ── Helpers ───────────────────────────────────────────────────────────────────

function readVoicePref(): boolean {
  try { return localStorage.getItem(VOICE_PREF_KEY) === "1"; } catch { return false; }
}
function saveVoicePref(on: boolean) {
  try { localStorage.setItem(VOICE_PREF_KEY, on ? "1" : "0"); } catch { /* noop */ }
}

function readPushSubscribedState(): string | null {
  try { return localStorage.getItem(PUSH_SUBSCRIBED_KEY); } catch { return null; }
}

function savePushSubscribedState(value: "prompted" | "true") {
  try { localStorage.setItem(PUSH_SUBSCRIBED_KEY, value); } catch { /* noop */ }
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

/** Strip <chips>...</chips> block from a Claude response string. */
function stripChipMarkup(text: string): string {
  return text
    .replace(/<chips>[\s\S]*?<\/chips>/gi, "")
    .replace(/<chips>[\s\S]*$/i, "")
    .trimEnd();
}

/** Extract and parse chips embedded in a Claude response string. */
function extractInlineChips(text: string): ChatChip[] {
  const match = text.match(/<chips>([\s\S]*?)<\/chips>/i);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1].trim());
    return Array.isArray(parsed) ? normalizeChips(parsed) : [];
  } catch {
    return [];
  }
}

/**
 * Downscale + re-encode a photo before upload. Phone photos are 3–8 MB each;
 * three of them as base64 blow past Vercel's 4.5 MB request-body limit and the
 * send is rejected at the edge (413) before the function runs. Cap the long
 * edge at 1280px and re-encode as JPEG ~0.82 so each photo lands ~150–350 KB.
 */
async function compressImageFile(
  file: File,
): Promise<{ dataUrl: string; base64: string; mediaType: string }> {
  const MAX_EDGE = 1280;
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = objectUrl;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    const base64 = dataUrl.split(",")[1] ?? "";
    return { dataUrl, base64, mediaType: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
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
  const [attachments, setAttachments] = useState<AttachmentContext[]>([]);
  const [, setDetectedLinkUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [schedulePicker, setSchedulePicker] = useState<{
    planId: string;
    label: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const didRestoreRef = useRef(false);
  const startListeningFiredRef = useRef(false);
  const pushPromptShownRef = useRef(false);
  const { isSupported: pushSupported, isSubscribed: pushSubscribed, subscribe: subscribePush } = usePushSubscription();

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

  const { start: rtStart, stop: rtStop, release: rtRelease, isListening, micDenied } = useRealtimeVoice(handleTranscript, handleVoiceError);

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
      setAttachments([]);
      setDetectedLinkUrl(null);
      setSchedulePicker(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentResponse, schedulePicker]);

  // Sync state with isListening. Only drive "listening" here — the transition
  // to "thinking" is owned by handleSendMessage (real transcript) and the
  // transition to "idle" by handleVoiceError (nothing captured).
  useEffect(() => {
    if (isListening) {
      setState("listening");
    }
  }, [isListening]); // eslint-disable-line react-hooks/exhaustive-deps

  const maybeAddPushPromptChip = useCallback((chips: ChatChip[]): ChatChip[] => {
    if (!PUSH_PUBLIC_KEY_AVAILABLE) return chips;
    if (!pushSupported || pushSubscribed || pushPromptShownRef.current) return chips;
    if (readPushSubscribedState()) return chips;
    pushPromptShownRef.current = true;
    savePushSubscribedState("prompted");
    return [
      ...chips,
      {
        label: "Get notified when plans are ready",
        message: "",
        action_type: "enable_push" as const,
      },
    ].slice(0, 5);
  }, [pushSupported, pushSubscribed]);

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

  // Poll a queued closet-import job and post the simple completion line +
  // closet chips when it finishes. The push notification covers the case where
  // the user has closed the sheet; this covers the case where it's still open.
  const pollWardrobeImport = useCallback(async (jobId: string) => {
    const deadline = Date.now() + 3 * 60 * 1000; // 3 min cap
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      let data: { status?: string; summary_text?: string | null; result?: { clarifications?: number } | null } | null = null;
      try {
        const res = await fetch(`/api/wardrobe/import?job_id=${encodeURIComponent(jobId)}`);
        if (res.ok) data = await res.json();
      } catch { /* keep polling */ }
      if (!data) continue;

      if (data.status === "done") {
        const needsConfirmation = (data.result?.clarifications ?? 0) > 0;
        setMessages((prev) => [
          ...prev,
          {
            role: "jarvis",
            content: data!.summary_text || "Closet import complete.",
            timestamp: Date.now(),
            chips: buildClosetChips(jobId, { needsConfirmation }),
          },
        ]);
        return;
      }
      if (data.status === "failed") {
        setMessages((prev) => [
          ...prev,
          {
            role: "jarvis",
            content: "I hit a snag importing those — try sending them again.",
            timestamp: Date.now(),
          },
        ]);
        return;
      }
    }
  }, []);

  const handleSendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || state === "thinking" || state === "responding") return;

    haptic([10, 50, 10]);
    const outgoingAttachments = attachments;
    const userMessage: Message = {
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
      attachments: outgoingAttachments.length > 0 ? outgoingAttachments : undefined,
    };
    setMessages((prev) => [...prev, userMessage]);
    setTextInput("");
    if (textInputRef.current) textInputRef.current.style.height = "auto";
    setDetectedLinkUrl(null);
    setState("thinking");
    setCurrentResponse("");
    setPlanCard(null);
    setError(null);
    setAnalyzingImage(outgoingAttachments.some((a) => a.type === "image"));

    const historyForApi = [...messages, userMessage].map((m) => ({
      role: m.role as "user" | "jarvis",
      content: m.content,
    }));

    // Build sheet context silently
    const sheetContext = buildSheetContext({ currentRoute: pathname, visibleItem, tonightEvents });

    // Non-image attachments get appended to text; images go as vision blocks
    const nonImageText = outgoingAttachments
      .filter((a) => a.type !== "image")
      .map((a) => `[Attached: ${a.label}]\n${a.context ?? ""}`)
      .join("\n\n");
    const messageWithAttachment = nonImageText ? `${trimmed}\n\n${nonImageText}` : trimmed;
    const attachmentsForApi = outgoingAttachments.map(attachmentForApi);

    setAttachments([]);

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
      let wardrobeJobId: string | null = null;

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
              wardrobe_job_id?: string | null;
            };

            if (event.type === "token" && event.text) {
              accumulated += event.text;
              setCurrentResponse(accumulated);
            } else if (event.type === "intent") {
              intentChips = normalizeChips(event.chips);
              if (event.wardrobe_job_id) wardrobeJobId = event.wardrobe_job_id;
              if (event.ask_about_plan && event.plan_context?.place_name) {
                setPlanCard({
                  place_name: event.plan_context.place_name,
                  date_hint: event.plan_context.date_hint ?? null,
                  occasion_type: event.plan_context.occasion_type ?? null,
                });
              }
            } else if (event.type === "done") {
              if (accumulated) {
                const inlineChips = extractInlineChips(accumulated);
                const cleanContent = stripChipMarkup(accumulated);
                const mergedChips = maybeAddPushPromptChip([
                  ...intentChips,
                  ...inlineChips.filter(
                    (ic) => !intentChips.some((c) => c.action_type === ic.action_type),
                  ),
                ]);
                const jarvisMsg: Message = {
                  role: "jarvis",
                  content: cleanContent,
                  timestamp: Date.now(),
                  chips: mergedChips.length > 0 ? mergedChips : undefined,
                };
                setMessages((prev) => [...prev, jarvisMsg]);
                setCurrentResponse("");
                if (voiceOn) void playJarvisVoice(cleanContent);
              }
              setState("idle");
              setAnalyzingImage(false);
              if (wardrobeJobId) void pollWardrobeImport(wardrobeJobId);
            } else if (event.type === "error") {
              setError(event.message ?? "Something went wrong.");
              setState("idle");
              setAnalyzingImage(false);
            }
          } catch { /* malformed SSE */ }
        }
      }

      if (accumulated && !messages.find((m) => m.content === accumulated)) {
        const inlineChips = extractInlineChips(accumulated);
        const cleanContent = stripChipMarkup(accumulated);
        const mergedChips = maybeAddPushPromptChip([
          ...intentChips,
          ...inlineChips.filter(
            (ic) => !intentChips.some((c) => c.action_type === ic.action_type),
          ),
        ]);
        setMessages((prev) => {
          if (prev[prev.length - 1]?.role === "jarvis") return prev;
          return [...prev, {
            role: "jarvis",
            content: cleanContent,
            timestamp: Date.now(),
            chips: mergedChips.length > 0 ? mergedChips : undefined,
          }];
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
  }, [messages, state, voiceOn, pathname, visibleItem, tonightEvents, attachments, maybeAddPushPromptChip, pollWardrobeImport]);

  const busy = state === "thinking" || state === "responding";

  const detectLinkAttachment = useCallback((value: string) => {
    const url = value.match(URL_RE)?.[0]?.replace(/[),.;!?]+$/, "") ?? null;
    if (!url) {
      setDetectedLinkUrl((current) => {
        if (current) {
          setAttachments((existing) =>
            existing.filter((a) => !(a.type === "link" && a.url === current)),
          );
        }
        return null;
      });
      return;
    }

    setDetectedLinkUrl((current) => {
      if (current === url) return current;
      setAttachments((existing) => {
        const withoutLink = existing.filter((a) => a.type !== "link");
        return [
          ...withoutLink,
          { type: "link", label: url, context: `User pasted link: ${url}`, url },
        ];
      });
      return url;
    });
  }, []);

  const autoSizeTextarea = useCallback(() => {
    const el = textInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const handleTextInputChange = useCallback((value: string) => {
    setTextInput(value);
    detectLinkAttachment(value);
    requestAnimationFrame(autoSizeTextarea);
  }, [detectLinkAttachment, autoSizeTextarea]);

  const handleTextSubmit = useCallback(() => {
    const txt = textInput.trim();
    if (!txt && attachments.length === 0) return;
    void handleSendMessage(txt);
  }, [textInput, attachments, handleSendMessage]);

  const handleChipClick = useCallback(async (chip: ChatChip) => {
    if (busy) return;
    if (chip.action_type === "send_message" || chip.action_type === "find_similar" || chip.action_type === "compare") {
      void handleSendMessage(chip.message);
      return;
    }

    if (chip.action_type === "open_closet") {
      haptic(8);
      const filter = stringPayload(chip.payload, "filter");
      onClose();
      router.push(filter ? `/wardrobe?filter=${encodeURIComponent(filter)}` : "/wardrobe");
      return;
    }

    if (chip.action_type === "undo_import") {
      const jobId = stringPayload(chip.payload, "job_id");
      if (!jobId) return;
      haptic(8);
      try {
        const res = await fetch("/api/wardrobe/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "undo_import", job_id: jobId }),
        });
        const data = (await res.json().catch(() => ({}))) as { removed?: number };
        setMessages((prev) => [
          ...prev,
          {
            role: "jarvis",
            content: data.removed
              ? `Removed those ${data.removed} ${data.removed === 1 ? "piece" : "pieces"} from your closet.`
              : "Nothing left to undo from that import.",
            timestamp: Date.now(),
          },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "jarvis", content: "Couldn't undo that — try again from your closet.", timestamp: Date.now() },
        ]);
      }
      return;
    }

    if (chip.action_type === "enable_push") {
      haptic(8);
      const ok = await subscribePush();
      if (ok) {
        savePushSubscribedState("true");
        setMessages((prev) => [
          ...prev,
          {
            role: "jarvis",
            content: "Got it — I'll notify you when things are ready.",
            timestamp: Date.now(),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "jarvis",
            content: "No problem. Notifications are off for now.",
            timestamp: Date.now(),
          },
        ]);
      }
      return;
    }

    if (chip.action_type === "build_plan") {
      const itemId = stringPayload(chip.payload, "item_id");
      const observationId = stringPayload(chip.payload, "observation_id");
      const candidateId = stringPayload(chip.payload, "candidate_id");
      if (!itemId && !observationId && !candidateId) return;
      haptic(8);
      const chatContext = chatContextPayload(chip);
      const userMessage: Message = {
        role: "user",
        content: chip.message,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setState("thinking");
      setError(null);
      // Route every Build Plan tap through the server action: it resolves the
      // item (researching a captured intent if needed), builds, and auto-schedules
      // so the tap actually confirms a date — then we render the confirmation.
      try {
        const res = await fetch("/api/chat/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action_type: "build_plan",
            message: chip.message,
            payload: { ...chip.payload, ...chatContext },
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          message?: string;
          chips?: Array<string | ChatChip>;
          error?: string;
        };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't build the plan.");
        const jarvisMsg: Message = {
          role: "jarvis",
          content: data.message ?? "Building your plan now — I'll have it ready shortly.",
          timestamp: Date.now(),
          chips: normalizeChips(data.chips),
        };
        setMessages((prev) => {
          const next = [...prev, jarvisMsg];
          saveSession(next);
          return next;
        });
        setState("idle");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't build the plan.");
        setState("idle");
      }
      return;
    }

    if (chip.action_type === "add_to_schedule") {
      const planId = stringPayload(chip.payload, "plan_id");
      if (!planId) {
        void handleSendMessage("Build the plan first, then I can schedule it.");
        return;
      }
      haptic(8);
      // "Add to Calendar" → export the .ics; "Change Time" → open the picker.
      if (chip.payload?.ics) {
        window.open(`/api/plans/${planId}/ics`, "_blank");
        return;
      }
      setSchedulePicker({ planId, label: chip.label });
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
  }, [busy, handleSendMessage, messages, onClose, subscribePush]);

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

  const handlePhotoAttach = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setPhotoLoading(true);
    try {
      const newAttachments = await Promise.all(
        files.map(async (file) => {
          const { dataUrl, base64, mediaType } = await compressImageFile(file);
          return {
            type: "image" as const,
            label: file.name || "Photo",
            imageDataUrl: dataUrl,
            imageBase64: base64,
            imageMediaType: mediaType,
          };
        }),
      );
      setAttachments((prev) => [...prev, ...newAttachments]);
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
                  {msg.attachments && msg.attachments.length > 0 ? (
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {msg.attachments.map((att, ai) => (
                        <AttachmentPreview key={ai} attachment={att} compact />
                      ))}
                    </div>
                  ) : null}
                  {msg.content ? (
                    <span className="text-[15px] leading-[1.6] text-warm-ivory/45">{msg.content}</span>
                  ) : null}
                </div>
              )}
            </div>
          ))}

          {schedulePicker ? (
            <SchedulePicker
              planId={schedulePicker.planId}
              label={schedulePicker.label}
              onConfirm={async (date, time) => {
                try {
                  const res = await fetch(`/api/plans/${schedulePicker.planId}/schedule`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ scheduled_date: date, scheduled_time: time }),
                  });
                  if (!res.ok) throw new Error("Schedule failed");
                  setSchedulePicker(null);
                  setMessages((prev) => [
                    ...prev,
                    {
                      role: "jarvis",
                      content: `Done — locked in for ${date} at ${time}.`,
                      timestamp: Date.now(),
                    },
                  ]);
                } catch {
                  setSchedulePicker(null);
                  setMessages((prev) => [
                    ...prev,
                    {
                      role: "jarvis",
                      content: "Couldn't save that — try again.",
                      timestamp: Date.now(),
                    },
                  ]);
                }
              }}
              onDismiss={() => setSchedulePicker(null)}
            />
          ) : null}

          {/* Streaming response */}
          {currentResponse ? (
            <div className="mb-5 text-left">
              <span className="mr-2 text-[10px] uppercase tracking-[0.16em] text-muted-gold/60">J.</span>
              <span className="text-[15px] leading-[1.6] text-warm-ivory/88">
                {stripChipMarkup(currentResponse)}
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

          {micDenied && !error ? (
            <div className="mb-4 text-[13px] text-warm-ivory/35">
              Mic is off — enable it in Settings → Safari → Microphone.
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

        {/* Attachment preview strip */}
        {attachments.length > 0 ? (
          <div className="mx-4 mb-2 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {attachments.map((att, idx) => (
              <div
                key={idx}
                className="relative shrink-0"
              >
                {att.type === "image" && att.imageDataUrl ? (
                  <img
                    src={att.imageDataUrl}
                    alt=""
                    className="h-16 w-16 rounded-lg object-cover"
                    style={{ border: "1px solid rgba(246,239,221,0.10)" }}
                  />
                ) : (
                  <div
                    className="flex h-16 w-36 items-center justify-center rounded-lg px-2"
                    style={{ border: "1px solid rgba(246,239,221,0.10)", background: "rgba(255,255,255,0.03)" }}
                  >
                    <span className="truncate text-[11px] text-warm-ivory/55">{att.label}</span>
                  </div>
                )}
                <button
                  type="button"
                  aria-label="Remove"
                  onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                  className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] text-warm-ivory/80"
                  style={{ background: "rgba(30,28,24,0.92)", border: "1px solid rgba(246,239,221,0.18)" }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {/* Input row */}
        <div
          className="flex shrink-0 flex-col"
          style={{ borderTop: "1px solid rgba(246,239,221,0.07)" }}
        >
          <div className="flex items-end gap-3 px-4 py-3">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) void handlePhotoAttach(files);
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

            <textarea
              ref={textInputRef}
              rows={1}
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
              className="flex-1 resize-none bg-transparent py-1.5 text-[14px] leading-[1.45] text-warm-ivory/88 placeholder:text-warm-ivory/25 focus:outline-none disabled:opacity-40"
              style={{ maxHeight: "7.5rem", overflowY: "auto" }}
            />

            {(textInput.trim().length > 0 || attachments.length > 0) && (
              <button
                type="button"
                aria-label="Send"
                onClick={handleTextSubmit}
                disabled={busy}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-150 disabled:opacity-40"
                style={{
                  border: "1px solid rgba(246,239,221,0.18)",
                  background: "transparent",
                  color: "rgba(246,239,221,0.45)",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2 11L11 2M11 2H4.5M11 2V8.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <button
              type="button"
              aria-label={isListening ? "Stop recording" : "Start recording"}
              onClick={() => void handleToggleMic()}
              disabled={busy || micDenied}
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

function stringPayload(payload: ChatChip["payload"], key: string): string | undefined {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberPayload(payload: ChatChip["payload"], key: string): number | undefined {
  const value = payload?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function chatContextPayload(chip: ChatChip): {
  timing_hint?: string;
  party_size?: number;
  notes?: string;
} {
  const timingHint =
    stringPayload(chip.payload, "timing_hint") ??
    stringPayload(chip.payload, "timingHint") ??
    inferTimingHint(chip.message);
  const partySize =
    numberPayload(chip.payload, "party_size") ??
    numberPayload(chip.payload, "partySize");
  const notes = stringPayload(chip.payload, "notes") ?? chip.message.trim();
  return {
    ...(timingHint ? { timing_hint: timingHint } : {}),
    ...(partySize ? { party_size: partySize } : {}),
    ...(notes ? { notes: notes.slice(0, 500) } : {}),
  };
}

function inferTimingHint(text: string): string | undefined {
  const match = text.match(
    /\b(today|tonight|tomorrow|this week|this weekend|next weekend|(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:morning|afternoon|evening|night))?)\b/i,
  );
  return match?.[0];
}

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
          className={compact ? "h-20 w-20 rounded-md object-cover" : "h-10 w-10 rounded-md object-cover"}
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

function SchedulePicker({
  planId: _planId,
  label,
  onConfirm,
  onDismiss,
}: {
  planId: string;
  label: string;
  onConfirm: (date: string, time: string) => void;
  onDismiss: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("19:00");

  return (
    <div className="mb-4 rounded-xl border border-warm-ivory/10 bg-white/[0.03] px-4 py-3">
      <p className="mb-3 text-[12px] uppercase tracking-[0.14em] text-muted-gold/70">
        {label}
      </p>
      <div className="flex gap-2">
        <input
          type="date"
          value={date}
          min={today}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 rounded-lg bg-white/[0.06] px-3 py-2 text-[14px] text-warm-ivory/90 outline-none"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="w-28 rounded-lg bg-white/[0.06] px-3 py-2 text-[14px] text-warm-ivory/90 outline-none"
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onConfirm(date, time)}
          className="flex-1 rounded-lg bg-muted-gold/20 py-2 text-[13px] uppercase tracking-[0.12em] text-muted-gold"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg px-4 py-2 text-[13px] text-warm-ivory/35"
        >
          Cancel
        </button>
      </div>
    </div>
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
