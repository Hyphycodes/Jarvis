import { DeepSectionFrame, DeepHeader } from "@/components";

const NOTES: { label: string; body: string }[] = [
  {
    label: "The walk home",
    body: "Cooler now. Route clears by 11:15. Take Halsted to Division — quieter, prettier.",
  },
  {
    label: "If you’re still talking",
    body: "Don’t kill the momentum. A nightcap at home is better than ordering one more here.",
  },
  {
    label: "Before bed",
    body: "Glass of water. Phone face-down. Notebook within reach — the best lines come at the edge of sleep.",
  },
];

const KEEP: string[] = [
  "One thing they said tonight worth remembering.",
  "One thing the room taught you.",
  "One thing to follow up on tomorrow.",
];

export default function AfterPage() {
  return (
    <DeepSectionFrame eyebrow="After">
      <DeepHeader
        title="When the night closes."
        subtitle={
          <>
            How the evening ends well.
            <br />
            What stays with you, and what to let go.
          </>
        }
        meta="Sparrow · Tonight · After 11:00 PM"
      />

      {/* Atmospheric closing image */}
      <div
        aria-hidden
        className="mt-6 -mx-6 h-[180px]"
        style={{
          background:
            "radial-gradient(70% 80% at 50% 30%, rgba(184,146,74,0.10), transparent 60%), linear-gradient(180deg, #0f0f12 0%, #0a0a0b 100%)",
        }}
      />

      <section className="mt-8">
        <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
          The Wind-Down
        </h2>
        <ul className="mt-4 flex flex-col divide-y divide-white/[0.06]">
          {NOTES.map((n) => (
            <li key={n.label} className="py-5">
              <div className="font-serif text-[18px] leading-tight text-warm-ivory">
                {n.label}
              </div>
              <p className="mt-2 font-serif text-[14px] italic leading-[1.5] text-warm-ivory/65">
                {n.body}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 h-px w-full bg-white/[0.06]" />

      <section className="mt-8">
        <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
          What to Keep
        </h2>
        <p className="mt-2 font-serif text-[15px] italic text-warm-ivory/85">
          Three small things, written down before they evaporate.
        </p>
        <ol className="mt-5 flex flex-col gap-5">
          {KEEP.map((line) => (
            <li
              key={line}
              className="grid grid-cols-[32px_1fr] items-start gap-2"
            >
              <span
                aria-hidden
                className="mt-3 h-px w-5 bg-muted-gold/60"
              />
              <span className="font-serif text-[15px] italic leading-[1.5] text-warm-ivory/85">
                {line}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <aside className="mt-10 border-l-2 border-muted-gold/40 pl-4">
        <div className="text-warm-ivory/30 font-serif text-[28px] leading-none">
          “
        </div>
        <p className="font-serif text-[16px] italic leading-[1.45] text-warm-ivory/80">
          The night earns its weight after it ends.
          <br />
          Let it settle before you call it.
        </p>
      </aside>

      <p className="mt-10 text-center font-serif text-[15px] italic leading-[1.5] text-warm-ivory/55">
        Sleep well. Tomorrow is already in motion.
      </p>
    </DeepSectionFrame>
  );
}
