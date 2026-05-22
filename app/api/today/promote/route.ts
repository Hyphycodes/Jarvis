/**
 * POST /api/today/promote
 *
 * Manually-triggered day-of promotion. Moves items whose starts_at is today
 * to destination="today", and marks past-due items as expired.
 *
 * Intentionally NOT called from any page render — Today loader uses the
 * read-only `findDayOfItems()` for inclusion without mutation. This route
 * exists so the founder can run promotion explicitly (or a future cron can
 * hit it without API surface changes).
 */

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { runDayOfPromotion } from "@/lib/scheduling/promoteItems";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await runDayOfPromotion();
    revalidatePath("/");
    revalidatePath("/upcoming");
    revalidatePath("/account/history");
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHENTICATED") {
        return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
      }
      if (error.message.startsWith("FORBIDDEN")) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
