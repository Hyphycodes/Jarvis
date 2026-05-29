import { requireOwner } from "@/lib/auth";
import { hasAnthropic, getAnthropicClient, DEFAULT_MODEL } from "@/lib/ai/anthropic";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { buildBrainContext } from "@/lib/brain/context";
import {
  CONVERSATION_SYSTEM_PROMPT,
  buildConversationMessages,
  extractMentionedPlaceNames,
  type ConversationMessage,
} from "@/lib/brain/conversationBrain";
import { classifyIntent } from "@/lib/brain/intentClassifier";
import type { PlacesLibraryRow } from "@/lib/types/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchLibraryEntriesForNames(
  userId: string,
  names: string[],
): Promise<PlacesLibraryRow[]> {
  if (!names.length) return [];
  try {
    const supabase = await getServerSupabase();
    const slugs = names.map(makeSlug);
    const { data } = await supabase
      .from("places_library")
      .select("*")
      .eq("user_id", userId)
      .in("slug", slugs)
      .limit(6);
    return (data ?? []) as PlacesLibraryRow[];
  } catch {
    return [];
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
    };

    const message = typeof body.text === "string" ? body.text.trim() : "";
    if (!message) {
      return new Response(
        `data: ${JSON.stringify({ type: "error", message: "text is required" })}\n\n`,
        { status: 400, headers: { "Content-Type": "text/event-stream" } },
      );
    }

    const history: ConversationMessage[] = Array.isArray(body.history)
      ? body.history.slice(-16)
      : [];

    // Start intent classification immediately (runs in parallel with everything else)
    const intentResultPromise = classifyIntent(message, history);

    // Fetch brain context
    const context = await buildBrainContext({ includeWeather: false });

    // Fetch library entries for any named places
    const mentionedNames = extractMentionedPlaceNames(message, history);
    const libraryEntries = await fetchLibraryEntriesForNames(owner.id, mentionedNames);

    // Build Anthropic messages
    const messages = buildConversationMessages({
      message,
      history,
      context,
      libraryEntries,
    });

    const client = getAnthropicClient();

    // ── Streaming SSE response ────────────────────────────────────────────────
    // Format:
    //   data: {"type":"intent", "intent":"...", "ask_about_plan":bool, "plan_context":...}
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

        // Start streaming from Anthropic
        const stream = client.messages.stream({
          model: DEFAULT_MODEL,
          max_tokens: 400,
          temperature: 0.7,
          system: CONVERSATION_SYSTEM_PROMPT,
          messages,
        });

        // Send intent as soon as it resolves (may arrive mid-stream)
        intentResultPromise
          .then((intent) => {
            send({ type: "intent", ...intent });
          })
          .catch(() => {
            send({ type: "intent", intent: "explore", ask_about_plan: false, plan_context: null });
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

        // Ensure intent was sent before closing
        await intentResultPromise.catch(() => {});

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
