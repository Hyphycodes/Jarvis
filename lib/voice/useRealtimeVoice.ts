"use client";

import { useCallback, useRef, useState } from "react";

function getSupportedMimeType() {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "audio/mp4";
}

function audioExtensionForMime(mimeType: string): "webm" | "ogg" | "mp4" {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  return "mp4";
}

// Below this captured duration we treat the take as "nothing said" and skip the
// transcription round-trip entirely.
const MIN_CAPTURE_MS = 300;

export function useRealtimeVoice(
  onTranscript: (text: string, final: boolean) => void,
  onError: (msg: string) => void,
) {
  const [isListening, setIsListening] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);

  const runTranscription = useCallback(async (blob: Blob) => {
    try {
      const mimeType = blob.type || "audio/mp4";
      const file = new File([blob], `audio.${audioExtensionForMime(mimeType)}`, { type: mimeType });
      const form = new FormData();
      form.append("audio", file);
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; text?: string };
      if (data.ok && data.text) {
        onTranscript(data.text, true);
      } else {
        onError("Didn't catch that, try again.");
      }
    } catch {
      onError("Didn't catch that, try again.");
    }
  }, [onTranscript, onError]);

  const start = useCallback(async () => {
    if (isListening) return;

    // Reuse a retained stream if we already have mic permission this session;
    // otherwise request it once and keep it across start/stop.
    let stream = streamRef.current;
    if (!stream || !stream.active) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      } catch {
        onError("Microphone access denied.");
        return;
      }
    }

    const mimeType = getSupportedMimeType();
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    chunksRef.current = [];
    startedAtRef.current = Date.now();

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const elapsed = Date.now() - startedAtRef.current;
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setIsListening(false);
      if (blob.size === 0 || elapsed < MIN_CAPTURE_MS) {
        onError("Didn't catch that, try again.");
        return;
      }
      void runTranscription(blob);
    };

    recorder.start();
    setIsListening(true);
  }, [isListening, onError, runTranscription]);

  const stop = useCallback(() => {
    // Stop the recorder (its onstop drives transcription) but KEEP the stream
    // tracks alive so iOS does not re-prompt for mic permission next take.
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      setIsListening(false);
    }
  }, []);

  // Release the retained mic stream — only when the sheet closes.
  const release = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsListening(false);
  }, []);

  return { start, stop, release, isListening };
}
