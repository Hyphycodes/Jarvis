import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loadPlanBriefBySlug } from "@/lib/plans/loadBrief";

export const metadata = { title: "Around It · Plan · Jarvis" };
export const dynamic = "force-dynamic";

export default async function AroundItPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/plan/${encodeURIComponent(slug)}/around-it`);
  const brief = await loadPlanBriefBySlug(slug);
  if (!brief) notFound();

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        padding: "88px 20px 120px",
      }}
    >
      <p
        style={{
          fontSize: "11px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginBottom: "16px",
        }}
      >
        Around It
      </p>
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "28px",
          fontStyle: "italic",
          color: "var(--text-primary)",
          lineHeight: 1.15,
          marginBottom: "24px",
        }}
      >
        {brief.title}
      </h1>
      <p style={{ fontSize: "14px", color: "var(--text-muted)", lineHeight: 1.6 }}>
        Satellites — before, instead, and after — are being prepared. Check back
        once the plan is fully built.
      </p>
    </main>
  );
}
