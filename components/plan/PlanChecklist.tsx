/**
 * PlanChecklist — bordered ring + label rows. Used by the WHAT TO BRING
 * block on the Before You Go page (matches the OG reference exactly).
 *
 * Static / decorative for now — no checked state. Future sprint can
 * wire these to a real grab-list toggle endpoint.
 */
export function PlanChecklist({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-col gap-3">
      {items.map((label, i) => (
        <li key={`${label}-${i}`} className="flex items-center gap-4">
          <span
            aria-hidden
            className="block h-[18px] w-[18px] shrink-0 rounded-full"
            style={{ border: "1.5px solid var(--gold-dim)" }}
          />
          <span
            className="font-serif italic"
            style={{
              color: "var(--text-primary)",
              fontSize: "16px",
              lineHeight: 1.45,
            }}
          >
            {label}
          </span>
        </li>
      ))}
    </ul>
  );
}
