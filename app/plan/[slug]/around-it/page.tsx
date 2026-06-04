import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loadPlanBriefBySlug } from "@/lib/plans/loadBrief";
import { PlanTopBar } from "@/components/plan/PlanTopBar";
import { PlanShell } from "@/components/plan/PlanShell";

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

  const backHref = `/plan/${slug}`;

  // Only render satellite content that is real (not copy-bank fallback).
  const hasDetours = !brief.detours.fallback && Boolean(brief.detours.body);
  const hasAfter = !brief.after.fallback && Boolean(brief.after.body);

  return (
    <PlanShell>
      <PlanTopBar backHref={backHref} eyebrowDate="AROUND IT" />

      <div style={{ paddingTop: "24px", paddingLeft: "20px", paddingRight: "20px" }}>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "32px",
            fontStyle: "italic",
            color: "var(--text-primary)",
            lineHeight: 1.1,
            marginBottom: "8px",
          }}
        >
          Around It
        </h1>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "32px" }}>
          Before, instead, and after — all ready if you want them.
        </p>
      </div>

      {hasDetours ? (
        <SatelliteSection
          title="Instead / Before"
          body={brief.detours.body}
          bullets={brief.detours.bullets}
        />
      ) : null}

      {hasAfter ? (
        <SatelliteSection
          title="After"
          body={brief.after.body}
          bullets={brief.after.bullets}
        />
      ) : null}

      {!hasDetours && !hasAfter ? (
        <div
          style={{
            padding: "20px",
            color: "var(--text-muted)",
            fontSize: "14px",
            lineHeight: 1.6,
          }}
        >
          Nothing specific to suggest around this one. The main event is the point.
        </div>
      ) : null}
    </PlanShell>
  );
}

function SatelliteSection({
  title,
  body,
  bullets,
}: {
  title: string;
  body: string;
  bullets?: string[];
}) {
  return (
    <section
      style={{
        padding: "20px",
        borderTop: "1px solid var(--border)",
        marginBottom: "8px",
      }}
    >
      <p
        style={{
          fontSize: "11px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--gold)",
          marginBottom: "12px",
        }}
      >
        {title}
      </p>
      <p style={{ fontSize: "14px", color: "var(--text-primary)", lineHeight: 1.65 }}>
        {body}
      </p>
      {bullets && bullets.length > 0 ? (
        <ul style={{ marginTop: "16px", paddingLeft: "0", listStyle: "none" }}>
          {bullets.map((bullet, i) => (
            <li
              key={i}
              style={{
                fontSize: "14px",
                color: "var(--text-primary)",
                lineHeight: 1.6,
                padding: "8px 0",
                borderTop: i > 0 ? "1px solid var(--border)" : undefined,
              }}
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{
                __html: bullet.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"),
              }}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
