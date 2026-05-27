import { DeepSectionFrame, DeepHeader } from "@/components";

const BRING = [
  "Wallet",
  "Valet ticket (in jacket pocket, not pants)",
  "The small notebook",
  "Reading glasses",
  "Phone on silent",
];

const KNOW: string[] = [
  "Reservation under your name. Ask for Marco — he’s the manager. Mention the patio if available.",
  "They finish dishes with lemon olive oil. Ask for extra. It’s the move.",
  "The wine list is long. Trust the somm — order the second cheapest bottle on the natural wine page.",
];

export default function BeforeYouGoPage() {
  return (
    <DeepSectionFrame eyebrow="Before You Go">
      <DeepHeader
        title="Ready the night."
        subtitle={
          <>
            What to wear, what to bring, what to know.
            <br />
            Set yourself before you set out.
          </>
        }
        meta="Sparrow · Tonight · 8:30 PM"
      />

      {/* What to wear */}
      <section className="mt-8 grid grid-cols-[1.2fr_1fr] gap-5">
        <div>
          <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
            What to Wear
          </h2>
          <div className="mt-4 flex flex-col divide-y divide-white/[0.06] font-serif text-[15px] italic leading-[1.45] text-warm-ivory/85">
            <p className="pb-4">
              Quiet luxury. The room is dim — let the fit be subtle.
            </p>
            <p className="py-4">Charcoal or navy. Tailored, not formal.</p>
            <p className="py-4">
              Leather loafers, not sneakers. The walk home will be wet.
            </p>
            <p className="pt-4">A jacket. The kitchen runs cool.</p>
          </div>
        </div>
        <div
          aria-hidden
          className="aspect-[3/4] w-full"
          style={{
            background:
              "radial-gradient(70% 60% at 60% 35%, rgba(232,228,168,0.07), transparent 65%), linear-gradient(180deg, #16161a 0%, #0a0a0b 100%)",
          }}
        />
      </section>

      <Divider />

      {/* What to bring */}
      <section className="mt-8">
        <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
          What to Bring
        </h2>
        <p className="mt-2 font-serif text-[15px] italic text-warm-ivory/85">
          Five things. No more.
        </p>
        <ul className="mt-5 flex flex-col gap-3">
          {BRING.map((item) => (
            <li
              key={item}
              className="flex items-center gap-4 text-[15px] text-warm-ivory/85"
            >
              <span
                aria-hidden
                className="h-5 w-5 shrink-0 rounded-full border border-muted-gold/55"
              />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <Divider />

      {/* What to know */}
      <section className="mt-8">
        <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
          What to Know
        </h2>
        <p className="mt-2 font-serif text-[15px] italic text-warm-ivory/85">
          Three things worth carrying in.
        </p>
        <ol className="mt-5 flex flex-col gap-5">
          {KNOW.map((line) => (
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

      <div className="mt-12 h-px w-full bg-white/[0.06]" />

      <p className="mt-6 text-center font-serif text-[15px] italic text-warm-ivory/65">
        Take your time. The night is staged.
      </p>
    </DeepSectionFrame>
  );
}

function Divider() {
  return <div className="mt-10 h-px w-full bg-white/[0.06]" />;
}
