import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { hasAnthropic, getAnthropicClient, DEFAULT_MODEL } from "@/lib/ai/anthropic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    await requireOwner();

    const body = (await req.json().catch(() => ({}))) as { url?: string };
    const url = typeof body.url === "string" ? body.url.trim() : "";

    if (!url || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ ok: false, error: "Invalid URL" }, { status: 400 });
    }

    // Fetch the page
    let rawText = "";
    let pageTitle = "";
    try {
      const fetchRes = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Jarvis/1.0)" },
        signal: AbortSignal.timeout(8000),
      });
      const html = await fetchRes.text();
      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      pageTitle = titleMatch ? titleMatch[1].trim() : url;
      // Strip HTML tags and collapse whitespace
      rawText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&[a-z#0-9]+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 6000);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Could not fetch that URL." },
        { status: 422 },
      );
    }

    if (!hasAnthropic()) {
      return NextResponse.json({
        ok: true,
        title: pageTitle,
        summary: rawText.slice(0, 200),
        context: `User attached link: ${pageTitle} — ${rawText.slice(0, 200)}`,
      });
    }

    // Summarize with Claude
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 200,
      temperature: 0,
      system: "Summarize this web page content in 1-3 sentences. Be specific and factual. No filler.",
      messages: [{ role: "user", content: rawText }],
    });

    const summary = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    return NextResponse.json({
      ok: true,
      title: pageTitle,
      summary,
      context: `User attached link: ${pageTitle} — ${summary}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch-link failed";
    const status = /login|owner|auth/i.test(message) ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
