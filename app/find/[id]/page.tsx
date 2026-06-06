import { redirect } from "next/navigation";
import { getViewableProfileId } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { FindDetail } from "@/components/finds/FindDetail";
import type { ProductDossier } from "@/lib/brain/productResearcher";

export const metadata = { title: "Find · Jarvis" };
export const dynamic = "force-dynamic";

export default async function FindPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { id: userId } = await getViewableProfileId();
  if (!userId) redirect(`/login?next=/find/${id}`);

  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from("surfaced_items")
    .select("id, payload, status")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  const payload = data && isRecord(data.payload) ? data.payload : null;
  const dossier = payload && isRecord(payload.finds) ? (payload.finds as ProductDossier) : null;

  if (!dossier) {
    return (
      <main style={{ minHeight: "100dvh", background: "var(--bg)", padding: "88px 20px" }}>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>This find isn&apos;t available.</p>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100dvh", background: "var(--bg)", padding: "64px 20px 120px" }}>
      <FindDetail itemId={id} dossier={dossier} />
    </main>
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
