import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loadPlanBriefBySlug } from "@/lib/plans/loadBrief";
import {
  PlanDivider,
  PlanSectionHeader,
  PlanShell,
  PlanTopBar,
} from "@/components/plan";
import { chapterCopy } from "@/lib/plans/planCopyBanks";
import { telUrl } from "@/lib/plans/venueLinks";
import type {
  PlanBrief,
  PlanChapterKey,
  PlanLightSection,
} from "@/lib/plans/planBrief";

/**
 * LightChapter — shared scaffold used by /atmosphere /details /detours
 * /after. Light on content, premium in feel — same shell, typography,
 * dividers, and quote/callout language as /before and /move.
 *
 * Always renders the full structure:
 *   top bar → eyebrow → italic title → italic subtitle → meta line →
 *   body paragraph → optional bullets → divider → confirmation line →
 *   closing line.
 *
 * Never blank. Never raw. The copy banks (`planCopyBanks.ts`) supply
 * fallback strings when no real section data exists.
 */
export async function renderLightChapter({
  params,
  chapterKey,
}: {
  params: Promise<{ slug: string }>;
  chapterKey: PlanChapterKey;
}): Promise<ReactNode> {
  const { slug } = await params;
  const user = await getSessionUser();
  if (!user)
    redirect(`/login?next=/plan/${encodeURIComponent(slug)}/${chapterKey}`);

  const brief = await loadPlanBriefBySlug(slug);
  if (!brief) notFound();

  const copy = chapterCopy(chapterKey);
  const section: PlanLightSection =
    chapterKey === "atmosphere"
      ? brief.atmosphere
      : chapterKey === "details"
        ? brief.details
        : chapterKey === "detours"
          ? brief.detours
          : brief.after;

  return (
    <PlanShell>
      <PlanTopBar
        backHref={`/plan/${slug}`}
        eyebrowCenter={copy.eyebrow}
        showShare
        showMore
      />

      <PlanSectionHeader
        title={copy.title}
        subtitle={copy.subtitle}
        meta={[brief.title, brief.dateLabel, brief.timeLabel]}
      />

      <section className="mt-10 px-5">
        <p
          className="font-serif italic"
          style={{
            color: section.fallback ? "var(--text-muted)" : "var(--text-primary)",
            fontSize: "17px",
            lineHeight: 1.55,
          }}
        >
          {section.body}
        </p>

        {section.bullets && section.bullets.length > 0 ? (
          <ul className="mt-5 flex flex-col gap-3">
            {section.bullets.map((b, i) => (
              <li
                key={`${b}-${i}`}
                className="grid grid-cols-[14px_minmax(0,1fr)] items-start gap-3"
              >
                <span
                  aria-hidden
                  className="mt-3 block h-px w-3"
                  style={{ background: "var(--gold-dim)" }}
                />
                <p
                  className="font-serif italic"
                  style={{
                    color: "var(--text-primary)",
                    fontSize: "15px",
                    lineHeight: 1.5,
                  }}
                >
                  {b}
                </p>
              </li>
            ))}
          </ul>
        ) : null}

        {chapterKey === "details" && brief.venueLinks ? (
          <DetailLinks links={brief.venueLinks} />
        ) : null}

        <PlanDivider variant="inset" className="mx-0 my-8" />

        <p
          className="font-serif italic"
          style={{
            color: "var(--gold-soft)",
            fontSize: "14px",
            lineHeight: 1.5,
          }}
        >
          {section.confirmation}
        </p>
      </section>

      <p
        className="mt-12 px-5 text-center font-serif italic"
        style={{
          color: "var(--text-muted)",
          fontSize: "17px",
          lineHeight: 1.5,
        }}
      >
        {section.closing}
      </p>
    </PlanShell>
  );
}

/**
 * The Details intel — clickable rows for maps, reservation, phone, site, and a
 * parking note. Maps + reservation are keyless deep-links (no geocoding).
 */
function DetailLinks({
  links,
}: {
  links: NonNullable<PlanBrief["venueLinks"]>;
}) {
  const rows: Array<{
    key: string;
    label: string;
    value: string;
    href?: string;
    external?: boolean;
  }> = [];
  if (links.mapsUrl)
    rows.push({
      key: "maps",
      label: "Address",
      value: links.address ?? "Open in Maps",
      href: links.mapsUrl,
      external: true,
    });
  if (links.reservationUrl)
    rows.push({
      key: "reserve",
      label: links.reservationLabel ?? "Reserve",
      value: "Book a table",
      href: links.reservationUrl,
      external: true,
    });
  if (links.phone)
    rows.push({
      key: "phone",
      label: "Call",
      value: links.phone,
      href: telUrl(links.phone),
    });
  if (links.officialUrl)
    rows.push({
      key: "site",
      label: "Website",
      value: hostOf(links.officialUrl),
      href: links.officialUrl,
      external: true,
    });
  if (links.parkingNote)
    rows.push({ key: "parking", label: "Parking", value: links.parkingNote });
  if (rows.length === 0) return null;

  return (
    <div className="mt-7" style={{ borderTop: "1px solid var(--border)" }}>
      {rows.map((r) => {
        const inner = (
          <div
            className="flex items-baseline justify-between gap-5 py-3.5"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <span
              className="font-mono text-[10px] uppercase tracking-[0.18em]"
              style={{ color: "var(--gold-soft)" }}
            >
              {r.label}
            </span>
            <span
              className="text-right font-serif"
              style={{ color: "var(--text-primary)", fontSize: "15px", lineHeight: 1.35 }}
            >
              {r.value}
            </span>
          </div>
        );
        return r.href ? (
          <a
            key={r.key}
            href={r.href}
            target={r.external ? "_blank" : undefined}
            rel={r.external ? "noopener" : undefined}
            className="block transition-colors hover:bg-white/[0.02]"
          >
            {inner}
          </a>
        ) : (
          <div key={r.key}>{inner}</div>
        );
      })}
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Visit site";
  }
}
