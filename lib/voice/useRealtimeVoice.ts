"use client";

import { useCallback, useRef, useState } from "react";

// PCM16 AudioWorklet processor — inlined to avoid a separate public file
const WORKLET_SOURCE = `
class PCM16Processor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const samples = input[0];
    const pcm16 = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    return true;
  }
}
registerProcessor("pcm16-processor", PCM16Processor);
`;

type SessionResponse = {
  ok: boolean;
  client_secret?: string;
  session_id?: string;
  error?: string;
};

type RTEvent = {
  type: string;
  delta?: string;
  transcript?: string;
  item?: { content?: Array<{ transcript?: string }> };
  response?: { output?: Array<{ content?: Array<{ transcript?: string }> }> };
};

export function useRealtimeVoice(
  onTranscript: (text: string, final: boolean) => void,
) {
  const [isListening, setIsListening] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const transcriptRef = useRef("");
  const fallbackBlobRef = useRef<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const stop = useCallback(() => {
    // Close worklet + audio context
    workletRef.current?.disconnect();
    workletRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;

    // Close WebSocket gracefully
    if (wsRef.current && wsRef.current.readyState < 2) {
      try {
        wsRef.current.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        wsRef.current.send(JSON.stringify({ type: "response.create" }));
      } catch {
        // best-effort
      }
    }
    wsRef.current?.close();
    wsRef.current = null;

    // Stop fallback recorder if running
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    setIsListening(false);
  }, []);

  const runFallbackTranscription = useCallback(async (blob: Blob) => {
    try {
      const form = new FormData();
      form.append("audio", blob);
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; text?: string };
      if (data.ok && data.text) {
        onTranscript(data.text, true);
      } else {
        onTranscript("Didn't catch that, try again.", true);
      }
    } catch {
      onTranscript("Didn't catch that, try again.", true);
    }
  }, [onTranscript]);

  const start = useCallback(async () => {
    if (isListening) return;
    transcriptRef.current = "";
    fallbackBlobRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
    } catch {
      onTranscript("Microphone access denied.", true);
      return;
    }

    // Always capture fallback blob in parallel
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const fallbackRecorder = new MediaRecorder(stream, { mimeType });
    fallbackBlobRef.current = [];
    fallbackRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) fallbackBlobRef.current.push(e.data);
    };
    fallbackRecorder.start(100);
    mediaRecorderRef.current = fallbackRecorder;

    // Attempt Realtime WebSocket
    let sessionOk = false;
    try {
      const sessionRes = await fetch("/api/voice/realtime", { method: "POST" });
      const session = (await sessionRes.json()) as SessionResponse;

      if (!session.ok || !session.client_secret) {
        throw new Error("No session token");
      }

      const ws = new WebSocket(
        `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview`,
        ["realtime", `openai-insecure-api-key.${session.client_secret}`, "openai-beta.realtime-v1"],
      );
      wsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        ws.addEventListener("open", () => resolve(), { once: true });
        ws.addEventListener("error", () => reject(new Error("WS open failed")), { once: true });
        setTimeout(() => reject(new Error("WS timeout")), 5000);
      });

      // Configure session
      ws.send(JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          input_audio_format: "pcm16",
          input_audio_transcription: { model: "whisper-1" },
          turn_detection: null, // manual turn control
        },
      }));

      ws.addEventListener("message", (ev: MessageEvent) => {
        try {
          const event = JSON.parse(ev.data as string) as RTEvent;

          if (event.type === "conversation.item.input_audio_transcription.completed") {
            const text = event.transcript?.trim() ?? "";
            if (text) {
              transcriptRef.current = text;
              onTranscript(text, true);
            }
          } else if (
            event.type === "response.audio_transcript.delta" &&
            event.delta
          ) {
            transcriptRef.current += event.delta;
            onTranscript(transcriptRef.current, false);
          } else if (event.type === "response.audio_transcript.done") {
            const text = event.transcript?.trim() ?? transcriptRef.current.trim();
            if (text) onTranscript(text, true);
          }
        } catch {
          // malformed event
        }
      });

      ws.addEventListener("close", () => {
        setIsListening(false);
      });

      ws.addEventListener("error", () => {
        // WS failed after open — fall through to ElevenLabs
        if (!transcriptRef.current) {
          fallbackRecorder.stop();
          fallbackRecorder.onstop = () => {
            const blob = new Blob(fallbackBlobRef.current, { type: mimeType });
            void runFallbackTranscription(blob);
          };
        }
      });

      // Wire AudioWorklet → WebSocket
      const audioCtx = new AudioContext({ sampleRate: 24000 });
      audioCtxRef.current = audioCtx;

      const workletBlob = new Blob([WORKLET_SOURCE], { type: "application/javascript" });
      const workletUrl = URL.createObjectURL(workletBlob);
      await audioCtx.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      const source = audioCtx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(audioCtx, "pcm16-processor");
      workletRef.current = worklet;

      worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (ws.readyState === WebSocket.OPEN) {
          // Convert ArrayBuffer to base64
          const bytes = new Uint8Array(e.data);
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          ws.send(JSON.stringify({
            type: "input_audio_buffer.append",
            audio: base64,
          }));
        }
      };

      source.connect(worklet);
      worklet.connect(audioCtx.destination);

      sessionOk = true;
      setIsListening(true);
    } catch {
      // Realtime setup failed — rely on fallback recorder already running
      sessionOk = false;
      setIsListening(true); // still listening via fallback

      // Override stop behavior to run fallback transcription
      fallbackRecorder.onstop = () => {
        const blob = new Blob(fallbackBlobRef.current, { type: mimeType });
        void runFallbackTranscription(blob);
        setIsListening(false);
      };
    }

    if (!sessionOk) {
      // stop() will trigger fallbackRecorder.stop() → onstop → transcription
    }
  }, [isListening, onTranscript, runFallbackTranscription]);

  return { start, stop, isListening };
}
