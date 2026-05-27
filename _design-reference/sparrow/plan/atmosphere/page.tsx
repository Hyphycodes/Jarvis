import { DeepSectionFrame, DeepHeader } from "@/components";

type Block = {
  label: string;
  body: string;
  media?: string; // css background
};

const BLOCKS: Block[] = [
  {
    label: "The Room",
    body: "Dim. Intentional. Conversations travel easy here.\nLow lights, dark woods, concrete, and candle.",
  },
  {
    label: "The Light",
    body: "Soft pools. Shadows in the right places.\nLet your eyes adjust.",
    media:
      "radial-gradient(60% 70% at 50% 50%, rgba(232,228,168,0.10), transparent 60%), linear-gradient(180deg, #18171b 0%, #0a0a0b 100%)",
  },
  {
    label: "The Feeling",
    body: "Unhurried. Confident. Understated.\nThe kind of place that rewards presence.",
    media:
      "radial-gradient(70% 70% at 30% 60%, rgba(184,146,74,0.10), transparent 60%), linear-gradient(180deg, #16161a 0%, #0a0a0b 100%)",
  },
  {
    label: "The Note",
    body: "This isn’t a scene. It’s a room that knows itself.\nBe here, not on display.",
    media:
      "radial-gradient(60% 70% at 70% 40%, rgba(201,169,110,0.10), transparent 60%), linear-gradient(180deg, #15151a 0%, #0a0a0b 100%)",
  },
];

const ALBUMS = [
  "rgba(184,146,74,0.18)",
  "rgba(201,169,110,0.16)",
  "rgba(232,228,168,0.12)",
  "rgba(184,146,74,0.14)",
  "rgba(201,169,110,0.12)",
  "rgba(232,228,168,0.10)",
];

export default function AtmospherePage() {
  return (
    <DeepSectionFrame eyebrow="Atmosphere">
      <DeepHeader
        title="The energy of the night."
        subtitle="Mood, music, light, and the feeling we’re walking into."
        meta="Sparrow · Tonight · 8:30 PM"
      />

      <div
        aria-hidden
        className="mt-6 -mx-6 h-[260px]"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 35%, rgba(184,146,74,0.20), transparent 60%), radial-gradient(50% 60% at 80% 70%, rgba(232,228,168,0.10), transparent 60%), linear-gradient(180deg, #14131a 0%, #0a0a0b 100%)",
        }}
      />

      {/* The Room */}
      <Section label={BLOCKS[0].label} body={BLOCKS[0].body} />
      <Divider />

      {/* The Music with album row */}
      <section className="mt-8">
        <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
          The Music
        </h2>
        <p className="mt-3 whitespace-pre-line font-serif text-[15px] italic leading-[1.55] text-warm-ivory/85">
          Low. Vinyl. Familiar without being obvious.{"\n"}
          Conversations first, always.
        </p>
        <ul className="mt-5 -mx-6 flex gap-3 overflow-x-auto px-6">
          {ALBUMS.map((tint, i) => (
            <li
              key={i}
              aria-hidden
              className="aspect-square w-[110px] shrink-0 border border-white/[0.06]"
              style={{
                background: `radial-gradient(60% 60% at 50% 50%, ${tint}, transparent 70%), linear-gradient(180deg, #1a1a1e 0%, #0c0c0e 100%)`,
              }}
            />
          ))}
        </ul>
        <div className="mt-3 text-[11px] uppercase tracking-editorial text-warm-ivory/50">
          Playlist for the Evening
        </div>
      </section>
      <Divider />

      {/* The Light */}
      <SectionWithMedia
        label={BLOCKS[1].label}
        body={BLOCKS[1].body}
        media={BLOCKS[1].media!}
      />
      <Divider />

      {/* The Feeling */}
      <SectionWithMedia
        label={BLOCKS[2].label}
        body={BLOCKS[2].body}
        media={BLOCKS[2].media!}
      />
      <Divider />

      {/* The Note */}
      <SectionWithMedia
        label={BLOCKS[3].label}
        body={BLOCKS[3].body}
        media={BLOCKS[3].media!}
      />

      <div className="mt-10 h-px w-full bg-white/[0.06]" />

      <p className="mt-6 text-center font-serif text-[15px] leading-[1.5] text-warm-ivory/65">
        The atmosphere is part of the meal.
        <br />
        Let it work on you.
      </p>
    </DeepSectionFrame>
  );
}

function Section({ label, body }: { label: string; body: string }) {
  return (
    <section className="mt-8">
      <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
        {label}
      </h2>
      <p className="mt-3 whitespace-pre-line font-serif text-[15px] italic leading-[1.55] text-warm-ivory/85">
        {body}
      </p>
    </section>
  );
}

function SectionWithMedia({
  label,
  body,
  media,
}: {
  label: string;
  body: string;
  media: string;
}) {
  return (
    <section className="mt-8 grid grid-cols-[1.2fr_1fr] items-start gap-5">
      <div>
        <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
          {label}
        </h2>
        <p className="mt-3 whitespace-pre-line font-serif text-[15px] italic leading-[1.55] text-warm-ivory/85">
          {body}
        </p>
      </div>
      <div
        aria-hidden
        className="aspect-[4/3] w-full"
        style={{ background: media }}
      />
    </section>
  );
}

function Divider() {
  return <div className="mt-8 h-px w-full bg-white/[0.06]" />;
}
