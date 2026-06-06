import { after } from "next/server";
import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { looksActionable, extractActionableIntent } from "@/lib/chat/intentCapture";
import { captureUserIntent, researchUserIntent } from "@/lib/radar/userIntent";
import { createFind } from "@/lib/finds/finds";
import { hasAnthropic, getAnthropicClient, DEFAULT_MODEL } from "@/lib/ai/anthropic";
import { buildChatContext } from "@/lib/chat/context/buildChatContext";
import { renderChatSystemPrompt } from "@/lib/chat/context/renderChatSystemPrompt";
import { buildChatMessages } from "@/lib/chat/buildChatMessages";
import { buildCommandActionChips, routeChatIntent } from "@/lib/chat/routeChatIntent";
import { handleImageDrop } from "@/lib/chat/handlers/handleImageDrop";
import { enqueueWardrobeImport, processWardrobeImportJob } from "@/lib/wardrobe/importJobs";
import { buildClosetChips } from "@/lib/wardrobe/closetChips";
import { handleLinkDrop, type LinkChatAttachment } from "@/lib/chat/handlers/handleLinkDrop";
import { handleTextObservation } from "@/lib/chat/handlers/handleTextObservation";
import { saveItem, passItem } from "@/lib/actions/items";
import { createCanonicalMemory } from "@/lib/memory/memoryStore";
import { recordChatBehaviorSignal } from "@/lib/chat/behaviorSignals";
import type { ConversationMessage } from "@/lib/brain/intentClassifier";
import type { ChatAttachment, ChatChip, ChatIntakeResult } from "@/lib/chat/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** The live week_shape note the radar synthesis stored (kind='week_shape'). */
async function readWeekShape(userId: string): Promise<string | null> {
  try {
    const supabase = await getServerSupabase();
    const { data } = await supabase
      .from("session_context")
      .select("content")
      .eq("user_id", userId)
      .eq("kind", "week_shape")
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const content = (data as { content?: string | null } | null)?.content;
    return typeof content === "string" && content.trim() ? content.trim() : null;
  } catch {
    return null;
  }
}

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

// ── Auto-commit ───────────────────────────────────────────────────────────────
// High-confidence, low-stakes intents that Jarvis executes immediately
// without requiring a chip tap.

type AutoCommitType = "save_item" | "pass_item" | "remember";

function isAutoCommitType(type: unknown): type is AutoCommitType {
  return type === "save_item" || type === "pass_item" || type === "remember";
}

async function executeHighConfidenceAction(
  actionType: AutoCommitType,
  context: { itemId?: string; content?: string; userId: string },
): Promise<{ success: boolean; confirmationText: string }> {
  try {
    if (actionType === "save_item") {
      if (!context.itemId) return { success: false, confirmationText: "" };
      await saveItem({ itemId: context.itemId });
      await recordChatBehaviorSignal({
        userId: context.userId,
        signalType: "item.save",
        objectType: "radar_item",
        objectId: context.itemId,
        metadata: { source: "voice_auto_commit" },
      });
      return { success: true, confirmationText: "Saved." };
    }
    if (actionType === "pass_item") {
      if (!context.itemId) return { success: false, confirmationText: "" };
      await passItem({ itemId: context.itemId });
      await recordChatBehaviorSignal({
        userId: context.userId,
        signalType: "item.pass",
        objectType: "radar_item",
        objectId: context.itemId,
        metadata: { source: "voice_auto_commit" },
      });
      return { success: true, confirmationText: "Passed." };
    }
    // actionType === "remember"
    if (!context.content) return { success: false, confirmationText: "" };
    const memoryId = await createCanonicalMemory({
      type: "confirmed_behavior",
      content: context.content,
      confidence: 0.72,
      source: "explicit",
      tags: ["voice", "auto_commit"],
      metadata: { source: "voice_auto_commit" },
    });
    await recordChatBehaviorSignal({
      userId: context.userId,
      signalType: "memory.accept",
      objectType: "memory",
      objectId: memoryId,
      metadata: { source: "voice_auto_commit", content: context.content },
    });
    return { success: true, confirmationText: "Got it, I'll remember that." };
  } catch (err) {
    console.error("[voice.respond] auto-commit failed", {
      actionType,
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: false, confirmationText: "" };
  }
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

    const messageRaw = typeof body.text === "string" ? body.text.trim() : "";
    const sheetContext = typeof body.sheet_context === "string" ? body.sheet_context.trim() : "";
    const attachments = normalizeAttachments(body.attachments);
    const hasImages = attachments.some((a) => a.type === "image");
    if (!messageRaw && !hasImages) {
      return new Response(
        `data: ${JSON.stringify({ type: "error", message: "text is required" })}\n\n`,
        { status: 400, headers: { "Content-Type": "text/event-stream" } },
      );
    }
    const message = messageRaw || "Here are some photos.";

    const history: ConversationMessage[] = Array.isArray(body.history)
      ? body.history.slice(-16)
      : [];

    const routed = routeChatIntent({ message, history, attachments });
    const commandChips = buildCommandActionChips({ message, sheetContext });

    // ── Auto-commit detection ────────────────────────────────────────────────
    // If a command chip is one of the three low-stakes auto-commit types,
    // execute it immediately and skip the chip from the response.
    const autoCommitChip = commandChips.find((chip) => isAutoCommitType(chip.action_type));
    let autoCommit: { success: boolean; confirmationText: string } | null = null;

    if (autoCommitChip && isAutoCommitType(autoCommitChip.action_type)) {
      const payload = autoCommitChip.payload ?? {};
      const itemId = typeof payload.item_id === "string" ? payload.item_id : undefined;
      const content = typeof payload.memory_content === "string" ? payload.memory_content : undefined;
      autoCommit = await executeHighConfidenceAction(
        autoCommitChip.action_type,
        { itemId, content, userId: owner.id },
      );
    }

    const committedActionType = autoCommit?.success ? autoCommitChip?.action_type : undefined;

    const context = await buildChatContext({
      userId: owner.id,
      includeWeather: false,
      contextQuery: message,
    });
    const imageAttachments = attachments.filter(
      (a): a is Extract<ChatAttachment, { type: "image" }> => a.type === "image",
    );
    const imageAttachment = imageAttachments[0];
    const linkAttachment = attachments.find((a): a is LinkChatAttachment => a.type === "link");
    let intakeResult: ChatIntakeResult | null = null;

    // ── Wardrobe (closet) intent ──────────────────────────────────────────────
    // Photos that are clearly about the owner's clothes go to a durable
    // background closet-import job instead of blocking the chat. We acknowledge
    // instantly; the worker extracts/dedupes/saves and notifies on completion.
    const WARDROBE_RE = /\b(closet|wardrobe|outfit|fit|fits|wore|wearing|pieces?|garments?|clothes?|clothing|jacket|hoodie|jeans|sneakers?|shirt|tee)\b/i;
    const isWardrobeIntent =
      imageAttachment != null && (imageAttachments.length >= 2 || WARDROBE_RE.test(messageRaw));

    let wardrobeJobId: string | null = null;
    let wardrobeContextBlock: string | null = null;
    let wardrobeChips: ChatChip[] = [];

    if (isWardrobeIntent) {
      try {
        const { jobId, photoCount } = await enqueueWardrobeImport({
          userId: owner.id,
          photos: imageAttachments.map((a) => ({
            base64: a.image_base64,
            mediaType: a.image_media_type,
          })),
          contextNote: messageRaw || undefined,
        });
        wardrobeJobId = jobId;
        after(() =>
          processWardrobeImportJob(jobId).catch((err) =>
            console.error("[voice.respond] wardrobe import process failed", err),
          ),
        );
        wardrobeChips = buildClosetChips(jobId);
        wardrobeContextBlock = [
          `[CLOSET IMPORT QUEUED]`,
          `You just started a background closet import of ${photoCount} photo(s).`,
          messageRaw ? `The owner's note: "${messageRaw}".` : null,
          `Acknowledge in ONE short, specific line — reference their note if useful (e.g. a named brand like the Ralph Lauren hoodie). Tell them they can close this while you process. Do NOT list, count, or invent pieces — the analysis runs in the background and you don't know the results yet.`,
        ]
          .filter(Boolean)
          .join("\n");
      } catch (err) {
        console.error("[voice.respond] wardrobe enqueue failed", err);
        // Fall through to normal image handling below.
      }
    }

    if (wardrobeJobId) {
      // Closet import owns this turn — skip the radar/observation intake path.
    } else if (imageAttachment) {
      intakeResult = await handleImageDrop({
        userId: owner.id,
        message,
        attachment: imageAttachment,
        siblingImages: imageAttachments.slice(1),
        context,
        commitmentMode: routed.commitmentMode,
      });
    } else if (linkAttachment) {
      intakeResult = await handleLinkDrop({
        userId: owner.id,
        message,
        attachment: linkAttachment,
        context,
      });
    } else {
      intakeResult = await handleTextObservation({
        userId: owner.id,
        message,
        intent: routed.intent,
      });
    }

    // ── Actionable intent capture ────────────────────────────────────────────
    // "I want to try Pizz'Amici next week" → capture as a prioritized user_intent
    // candidate and research/surface it through the unified pipeline in the
    // background. Gated by a cheap regex so we don't spend an LLM call per turn.
    let capturedIntentTitle: string | null = null;
    let capturedIntentKind: string | null = null;
    const capturedIntentChips: ChatChip[] = [];
    if (
      !imageAttachment &&
      !linkAttachment &&
      !committedActionType &&
      looksActionable(message)
    ) {
      try {
        const intent = await extractActionableIntent(message, history);
        if (intent && intent.kind === "finds") {
          // A thing to buy/source → research it and put the best pick in Finds.
          capturedIntentTitle = intent.title;
          capturedIntentKind = "finds";
          after(() =>
            createFind({
              userId: owner.id,
              mission: intent.title,
              context: intent.note,
              source: "user_intent",
            }).catch((err) => console.error("[voice.respond] find research failed", err)),
          );
        } else if (intent) {
          const candidateId = await captureUserIntent({
            userId: owner.id,
            title: intent.title,
            note: intent.note,
            dateHint: intent.dateHint,
            category: intent.category,
            kind: intent.kind === "finds" ? null : intent.kind,
            origin: "voice",
          });
          capturedIntentTitle = intent.title;
          // A real, actionable chip carrying the candidate id (+ any timing hint)
          // so tapping "Build Plan" researches, surfaces, builds + schedules it.
          capturedIntentChips.push({
            label: "Build Plan",
            message: `Build a plan for ${intent.title}.`,
            action_type: "build_plan",
            payload: {
              candidate_id: candidateId,
              title: intent.title,
              ...(intent.dateHint ? { timing_hint: intent.dateHint } : {}),
            },
          });
          after(() =>
            researchUserIntent(owner.id, candidateId).catch((err) =>
              console.error("[voice.respond] user-intent research failed", err),
            ),
          );
        }
      } catch (err) {
        console.error("[voice.respond] intent capture failed", err);
      }
    }

    const actionChips = mergeChips(
      wardrobeChips,
      capturedIntentChips,
      committedActionType
        ? commandChips.filter((chip) => chip.action_type !== committedActionType)
        : commandChips,
      routed.chips,
      intakeResult?.chips,
    );

    const client = getAnthropicClient();

    // Give the mic the live week narrative (the same week_shape the radar
    // synthesis stored) so it speaks to what's actually going on right now,
    // not just the permanent profile.
    const weekShape = await readWeekShape(owner.id);
    const liveContext = [
      weekShape ? `This week: ${weekShape}` : null,
      sheetContext || null,
    ]
      .filter(Boolean)
      .join("\n");

    const intakeSummary = capturedIntentTitle
      ? capturedIntentKind === "finds"
        ? `${intakeResult?.contextBlock ? `${intakeResult.contextBlock}\n` : ""}Owner wants to acquire "${capturedIntentTitle}". You're researching the best option and will put it in Finds. Acknowledge in one short, natural line.`
        : `${intakeResult?.contextBlock ? `${intakeResult.contextBlock}\n` : ""}Owner asked for "${capturedIntentTitle}". You've saved it to Radar and are researching it + building its plan now. Acknowledge in one short, natural line.`
      : wardrobeContextBlock ?? intakeResult?.contextBlock;

    const systemPrompt = renderChatSystemPrompt(context, {
      intent: routed.intent,
      sheetContext: liveContext || undefined,
      intakeSummary,
    });
    const messages = buildChatMessages({
      message,
      history,
      intakeContext: intakeSummary,
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
          wardrobe_job_id: wardrobeJobId,
        });

        // Prepend auto-commit confirmation before the LLM stream
        if (autoCommit?.success && autoCommit.confirmationText) {
          send({ type: "token", text: autoCommit.confirmationText + " " });
        }

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
