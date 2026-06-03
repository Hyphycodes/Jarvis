import { requireOwner } from "@/lib/auth";
import { hasAnthropic, getAnthropicClient, DEFAULT_MODEL } from "@/lib/ai/anthropic";
import { buildChatContext } from "@/lib/chat/context/buildChatContext";
import { renderChatSystemPrompt } from "@/lib/chat/context/renderChatSystemPrompt";
import { buildChatMessages } from "@/lib/chat/buildChatMessages";
import { buildCommandActionChips, routeChatIntent } from "@/lib/chat/routeChatIntent";
import { handleImageDrop } from "@/lib/chat/handlers/handleImageDrop";
import { handleTextObservation } from "@/lib/chat/handlers/handleTextObservation";
import type { ConversationMessage } from "@/lib/brain/intentClassifier";
import type { ChatAttachment, ChatChip, ChatIntakeResult } from "@/lib/chat/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeAttachments(value: unknown): ChatAttachment[] {
  if (!Array.isArray(value)) return [];
  const attachments: ChatAttachment[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.type !== "string") continue;
    if (entry.type === "image" && typeof entry.image_base64 === "string") {
      attachments.push({
        type: "image" as const,
        label: typeof entry.label === "string" ? entry.label : undefined,
        image_base64: entry.image_base64,
        image_media_type: typeof entry.image_media_type === "string" ? entry.image_media_type : undefined,
        preview_url: typeof entry.preview_url === "string" ? entry.preview_url : undefined,
      });
      continue;
    }
    if (entry.type === "link" || entry.type === "place" || entry.type === "text") {
      attachments.push({
        type: entry.type,
        label: typeof entry.label === "string" ? entry.label : undefined,
        context: typeof entry.context === "string" ? entry.context : undefined,
        url: typeof entry.url === "string" ? entry.url : undefined,
      });
    }
  }
  return attachments;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeChips(...groups: Array<ChatChip[] | undefined>): ChatChip[] {
  const seen = new Set<string>();
  const chips: ChatChip[] = [];
  for (const group of groups) {
    for (const chip of group ?? []) {
      const key = `${chip.action_type}:${chip.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chips.push(chip);
    }
  }
  return chips.slice(0, 5);
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const owner = await requireOwner();

    if (!hasAnthropic()) {
      return new Response(
        `data: ${JSON.stringify({ type: "error", message: "Brain not configured." })}\n\n`,
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      text?: string;
      history?: ConversationMessage[];
      sheet_context?: string;
      attachments?: unknown;
    };

    const message = typeof body.text === "string" ? body.text.trim() : "";
    const sheetContext = typeof body.sheet_context === "string" ? body.sheet_context.trim() : "";
    const attachments = normalizeAttachments(body.attachments);
    if (!message) {
      return new Response(
        `data: ${JSON.stringify({ type: "error", message: "text is required" })}\n\n`,
        { status: 400, headers: { "Content-Type": "text/event-stream" } },
      );
    }

    const history: ConversationMessage[] = Array.isArray(body.history)
      ? body.history.slice(-16)
      : [];

    const routed = routeChatIntent({ message, history, attachments });
    const commandChips = buildCommandActionChips({ message, sheetContext });
    const context = await buildChatContext({ userId: owner.id, includeWeather: false });
    const imageAttachment = attachments.find((a): a is Extract<ChatAttachment, { type: "image" }> => a.type === "image");
    let intakeResult: ChatIntakeResult | null = null;

    if (imageAttachment) {
      intakeResult = await handleImageDrop({
        userId: owner.id,
        message,
        attachment: imageAttachment,
        context,
        commitmentMode: routed.commitmentMode,
      });
    } else {
      intakeResult = await handleTextObservation({
        userId: owner.id,
        message,
        intent: routed.intent,
      });
    }

    const actionChips = mergeChips(commandChips, routed.chips, intakeResult?.chips);

    const client = getAnthropicClient();

    const systemPrompt = renderChatSystemPrompt(context, {
      intent: routed.intent,
      sheetContext: sheetContext || undefined,
      intakeSummary: intakeResult?.contextBlock,
    });
    const messages = buildChatMessages({
      message,
      history,
      intakeContext: intakeResult?.contextBlock,
    });

    // ── Streaming SSE response ────────────────────────────────────────────────
    // Format:
    //   data: {"type":"intent", "intent":"...", "chips":[...]}
    //   data: {"type":"token", "text":"..."}
    //   data: {"type":"done"}

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          } catch {
            // controller may already be closed
          }
        };

        send({
          type: "intent",
          intent: routed.intent,
          recognition_mode: routed.recognitionMode,
          commitment_mode: routed.commitmentMode,
          ask_about_plan: false,
          plan_context: null,
          chips: actionChips,
          observation_id: intakeResult?.observationId,
          radar_item_id: intakeResult?.radarItemId,
          planning_state: intakeResult?.state,
        });

        // Start streaming from Anthropic
        const stream = client.messages.stream({
          model: DEFAULT_MODEL,
          max_tokens: 400,
          temperature: 0.7,
          system: systemPrompt,
          messages,
        });

        // Stream text tokens
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              send({ type: "token", text: event.delta.text });
            }
          }
        } catch (err) {
          send({
            type: "error",
            message: err instanceof Error ? err.message : "Stream failed",
          });
        }

        send({ type: "done" });
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Respond failed";
    const status = /login|owner|auth/i.test(message) ? 401 : 500;

    // Return error as SSE so client parser handles it uniformly
    return new Response(
      `data: ${JSON.stringify({ type: "error", message })}\n\n`,
      {
        status,
        headers: { "Content-Type": "text/event-stream" },
      },
    );
  }
}
