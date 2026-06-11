import { after, NextResponse } from "next/server";
import { getViewableProfileId } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { enqueueFindResearch, processFindResearchJob } from "@/lib/finds/researchJobs";
import { readCircleGiftIdeas, readCircleImportantDates } from "@/lib/circle/personFields";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Gift intelligence scoped to a person. Runs the Finds-grade Product
 * Researcher with the person's real context (role, notes, gift ideas,
 * upcoming dates) as the mission — tight context is what makes it good.
 */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ personId: string }> },
) {
  try {
    const { personId } = await ctx.params;
    const { id: userId } = await getViewableProfileId();
    if (!userId) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const supabase = await getServerSupabase();
    const { data: person } = await supabase
      .from("circle_people")
      .select("*")
      .eq("id", personId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!person) {
      return NextResponse.json({ error: "Person not found." }, { status: 404 });
    }

    const row = person as Record<string, unknown>;
    const name = String(row.name ?? "");
    const notes = Array.isArray(row.notes) ? (row.notes as string[]) : [];
    const gifts = readCircleGiftIdeas(row.gift_ideas);
    const dates = readCircleImportantDates(row.important_dates);

    const contextParts = [
      typeof row.role === "string" && row.role ? `Who they are: ${row.role}.` : null,
      typeof row.current_thread === "string" && row.current_thread
        ? `Current thread: ${row.current_thread}.`
        : null,
      notes.length ? `What I know about them: ${notes.slice(-8).join(" · ")}` : null,
      gifts.length ? `Gift ideas already noted: ${gifts.map((g) => g.idea).join("; ")}` : null,
      dates.length ? `Their dates: ${dates.map((d) => `${d.label} ${d.date}`).join("; ")}` : null,
      "This is a GIFT for them — judge by THEIR taste and life, not mine. Attainable and personal beats expensive and generic.",
    ].filter(Boolean);

    const { jobId } = await enqueueFindResearch({
      userId,
      mission: `Gift for ${name}`,
      context: contextParts.join("\n"),
      source: "user_intent",
    });
    after(() =>
      processFindResearchJob(jobId).catch((err) =>
        console.error("[circle.gift] research failed", err),
      ),
    );

    return NextResponse.json({ ok: true, jobId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
