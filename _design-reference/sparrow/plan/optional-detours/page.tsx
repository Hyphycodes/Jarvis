import { DeepSectionFrame, DeepHeader } from "@/components";
import { MapPin, User } from "@/components/icons";

type Detour = {
  n: number;
  cat: string;
  name: string;
  body: string;
  walk: string;
  address: string;
  open: string;
  tint: string;
};

const DETOURS: Detour[] = [
  {
    n: 1,
    cat: "Cocktail Detour",
    name: "The Violet Hour",
    body: "Intimate. Excellent cocktails. The energy stays low.",
    walk: "8 min walk",
    address: "1520 N. Damen Ave\nChicago, IL 60622",
    open: "Open until 1:00 AM",
    tint: "rgba(184,146,74,0.16)",
  },
  {
    n: 2,
    cat: "Sweet Finish",
    name: "Hero Coffee Bar",
    body: "Tiramisu or affogato. Perfect wind-down.",
    walk: "11 min walk",
    address: "1235 N. Ashland Ave\nChicago, IL 60622",
    open: "Open until 12:00 AM",
    tint: "rgba(201,169,110,0.14)",
  },
  {
    n: 3,
    cat: "Scenic Route",
    name: "The River Walk",
    body: "Head west on Chicago Ave for skyline views and fresh air.",
    walk: "14 min walk",
    address: "Beautiful stretch\nalong the river.",
    open: "Always open",
    tint: "rgba(232,228,168,0.10)",
  },
];

export default function OptionalDetoursPage() {
  return (
    <DeepSectionFrame eyebrow="Optional Detours">
      <DeepHeader
        title="If the night opens up."
        subtitle="A few good doors are open, if you want them."
        meta="Sparrow · Tonight · After 10:30 PM"
      />

      {/* Map placeholder */}
      <div
        aria-hidden
        className="mt-6 -mx-6 h-[260px] border-y border-white/[0.06]"
        style={{
          background:
            "linear-gradient(135deg, rgba(184,146,74,0.04), transparent 60%), linear-gradient(180deg, #111114 0%, #0a0a0b 100%)",
        }}
      />

      <div className="mt-6">
        <div className="text-[11px] uppercase tracking-editorial text-warm-ivory/60">
          Not a plan. Just possibility.
        </div>
        <p className="mt-2 font-serif text-[15px] italic leading-[1.45] text-warm-ivory/75">
          No pressure, just options — curated for where the night could go.
        </p>
      </div>

      <ul className="mt-8 flex flex-col divide-y divide-white/[0.06]">
        {DETOURS.map((d) => (
          <DetourRow key={d.n} d={d} />
        ))}
      </ul>

      {/* Social detour */}
      <section className="mt-8 border border-muted-gold/30 bg-soft-black/70">
        <div className="grid grid-cols-[1fr_1fr_auto] items-start gap-4 p-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-full border border-muted-gold/50"
            >
              <User size={14} className="text-muted-gold" />
            </span>
            <div>
              <div className="text-[10px] uppercase tracking-editorial text-muted-gold">
                Social Detour
              </div>
              <div className="mt-1 font-serif text-[20px] italic leading-tight text-warm-ivory">
                Marco
              </div>
              <p className="mt-1 text-[12px] leading-[1.45] text-warm-ivory/65">
                He’s two blocks away if the night opens up.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin size={14} className="mt-[3px] text-muted-gold" />
            <div>
              <div className="text-[10px] uppercase tracking-editorial text-muted-gold">
                2 min walk
              </div>
              <div className="mt-1 text-[12px] leading-[1.45] text-warm-ivory/70">
                940 W. Randolph St
                <br />
                Chicago, IL 60607
              </div>
            </div>
          </div>
          <button
            type="button"
            className="flex flex-col items-center gap-1.5 text-[10px] uppercase tracking-editorial text-muted-gold"
          >
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-full border border-muted-gold/55"
            >
              <span className="text-[10px]">✉</span>
            </span>
            Message
            <br />
            Marco
          </button>
        </div>
      </section>

      {/* Quote */}
      <aside className="mt-10 border-l-2 border-muted-gold/40 pl-4">
        <div className="text-warm-ivory/30 font-serif text-[28px] leading-none">
          “
        </div>
        <p className="font-serif text-[16px] italic leading-[1.45] text-warm-ivory/80">
          The best nights don’t need more.
          <br />
          They just need the right next door.
        </p>
      </aside>

      <p className="mt-10 text-center text-[12px] leading-[1.6] text-warm-ivory/55">
        You don’t have to choose any of this.
        <br />
        The night is already yours.
      </p>
    </DeepSectionFrame>
  );
}

function DetourRow({ d }: { d: Detour }) {
  return (
    <li className="grid grid-cols-[80px_minmax(0,1fr)_120px] items-start gap-3 py-5">
      <div
        aria-hidden
        className="aspect-square w-full border border-white/[0.06]"
        style={{
          background: `radial-gradient(60% 60% at 50% 50%, ${d.tint}, transparent 70%), linear-gradient(180deg, #16161a 0%, #0a0a0b 100%)`,
        }}
      />
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-6 w-6 items-center justify-center rounded-full border border-muted-gold/55 text-[11px] text-muted-gold"
          >
            {d.n}
          </span>
          <div className="text-[10px] uppercase tracking-editorial text-muted-gold">
            {d.cat}
          </div>
        </div>
        <div className="mt-2 font-serif text-[20px] italic leading-tight text-warm-ivory">
          {d.name}
        </div>
        <p className="mt-2 font-serif text-[13px] italic leading-[1.45] text-warm-ivory/65">
          {d.body}
        </p>
      </div>
      <div className="border-l border-white/[0.06] pl-3 text-[11px] leading-[1.5] text-warm-ivory/65">
        <div className="flex items-center gap-1.5 text-muted-gold">
          <User size={11} />
          <span className="uppercase tracking-editorial">{d.walk}</span>
        </div>
        <div className="mt-2 whitespace-pre-line text-warm-ivory/70">
          {d.address}
        </div>
        <div className="mt-3 text-[10px] uppercase tracking-editorial text-warm-ivory/55">
          {d.open}
        </div>
      </div>
    </li>
  );
}
