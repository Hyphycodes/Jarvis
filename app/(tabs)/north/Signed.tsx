import Link from "next/link";
import { AppFrame, SectionLabel } from "@/components";
import { Arrow, Chevron } from "@/components/icons";

// TODO(intelligence): Replace signed North star, pillars, and signals with
// NorthPayload routed from stored North data. Do not add new product mock data.
const PILLARS: { n: string; name: string; status: string; tint: string }[] = [
  { n: "01", name: "Lifestyle", status: "Strong", tint: "rgba(184,146,74,0.10)" },
  { n: "02", name: "Health", status: "Focus", tint: "rgba(201,169,110,0.08)" },
  { n: "03", name: "Craft", status: "Building", tint: "rgba(232,228,168,0.06)" },
  { n: "04", name: "Relationships", status: "Nurturing", tint: "rgba(184,146,74,0.12)" },
  { n: "05", name: "Legacy", status: "Long Term", tint: "rgba(201,169,110,0.10)" },
];

const STEPS: { text: string; tag: string }[] = [
  { text: "Visit property in Spello with Luca", tag: "Ownership" },
  { text: "Train with intention this week", tag: "Health" },
  { text: "Book time with Marco in Umbria this summer", tag: "Relationships" },
];

export function NorthSigned() {
  return (
    <AppFrame>
      <header className="flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4">
          <h1 className="font-serif text-[56px] italic leading-[1.02] tracking-[-0.01em] text-warm-ivory">
            North
          </h1>
          <span className="self-start pt-[10px] text-[12px] uppercase tracking-editorial text-warm-ivory/60">
            May 17, 2025
          </span>
        </div>
        <p className="max-w-[42ch] text-[15px] leading-[1.55] text-warm-ivory/65">
          The life you’re building.
          <br />
          Umbria is the destination. This is the path.
        </p>
        <div className="h-px w-8 bg-muted-gold/50" />
      </header>

      <Hero />

      <section className="mt-8 grid grid-cols-[1.05fr_1fr] items-start gap-6">
        <div className="flex flex-col gap-3">
          <span className="text-[11px] uppercase tracking-editorial text-muted-gold/85">
            The North Star
          </span>
          <h2 className="font-serif text-[32px] font-normal leading-[1.05] tracking-[-0.01em] text-warm-ivory">
            Umbria, Italy
          </h2>
          <div className="h-px w-6 bg-muted-gold/55" />
          <p className="mt-1 text-[14px] leading-[1.55] text-warm-ivory/65">
            A slower life. Owned.
            <br />
            Surrounded by beauty,
            <br />
            craft, and real connection.
          </p>
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-2 text-[11px] uppercase tracking-editorial text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold"
          >
            View Vision <Arrow size={12} />
          </button>
        </div>
        <Compass />
      </section>

      <div className="mt-10 h-px w-full bg-white/[0.06]" />

      <section className="mt-8">
        <SectionLabel>Pillars</SectionLabel>
        <div className="mt-4 -mx-6 overflow-x-auto">
          <ul className="flex gap-2 px-6">
            {PILLARS.map((p) => (
              <li key={p.n} className="shrink-0">
                <PillarCard {...p} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-10">
        <SectionLabel
          trailing={
            <span className="inline-flex items-center gap-1.5 text-warm-ivory/70">
              View All <Arrow size={12} />
            </span>
          }
        >
          Next Right Steps
        </SectionLabel>
        <ul className="mt-4 flex flex-col">
          {STEPS.map((s, i) => (
            <StepRow
              key={s.text}
              text={s.text}
              tag={s.tag}
              divider={i !== STEPS.length - 1}
            />
          ))}
        </ul>
      </section>

      <aside className="mt-10 border-l-2 border-muted-gold/40 bg-soft-black/60 py-5 pl-5 pr-4">
        <div className="text-[10px] uppercase tracking-editorial text-muted-gold/85">
          North Reminder
        </div>
        <p className="mt-2 font-serif text-[20px] italic leading-[1.35] text-warm-ivory/85">
          Discipline today. Freedom tomorrow.
        </p>
      </aside>

      <Link
        href="/account"
        className="mt-8 flex items-center justify-between border-t border-divider/70 py-5 text-[11px] uppercase tracking-editorial text-warm-ivory/65 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory"
      >
        <span>Account &amp; Settings</span>
        <Chevron direction="right" size={14} className="text-warm-ivory/45" />
      </Link>

    </AppFrame>
  );
}

function Hero() {
  return (
    <div className="relative mt-8 -mx-6 h-[220px] overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, #1a1a1c 0%, #141416 45%, #0d0d0f 80%, #0a0a0b 100%)",
        }}
      />
      {/* atmospheric glow suggesting a landscape silhouette */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 30%, rgba(232,228,168,0.05), transparent 55%), radial-gradient(80% 60% at 70% 80%, rgba(184,146,74,0.06), transparent 60%)",
        }}
      />
      {/* horizon line */}
      <div
        aria-hidden
        className="absolute left-0 right-0 top-[62%] h-px bg-warm-ivory/10"
      />
      {/* fade to near-black at the bottom so the hero dissolves */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-24"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, #0A0A0B 100%)",
        }}
      />
    </div>
  );
}

function Compass() {
  const size = 168;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
  return (
    <div
      className="relative mx-auto"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="text-warm-ivory/20"
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
        {/* cardinal ticks */}
        <line x1={cx} y1={6} x2={cx} y2={18} stroke="currentColor" strokeWidth="1" />
        <line x1={cx} y1={size - 6} x2={cx} y2={size - 18} stroke="currentColor" strokeWidth="1" />
        <line x1={6} y1={cy} x2={18} y2={cy} stroke="currentColor" strokeWidth="1" />
        <line x1={size - 6} y1={cy} x2={size - 18} y2={cy} stroke="currentColor" strokeWidth="1" />
        {/* minor ticks */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i / 12) * Math.PI * 2;
          const x1 = cx + Math.sin(angle) * (r - 2);
          const y1 = cy - Math.cos(angle) * (r - 2);
          const x2 = cx + Math.sin(angle) * (r - 7);
          const y2 = cy - Math.cos(angle) * (r - 7);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.6"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-[9px] uppercase tracking-editorial text-warm-ivory/55">
          N
        </div>
        <div className="mt-2 text-[9px] uppercase tracking-editorial text-warm-ivory/55">
          Heading
        </div>
        <div className="font-serif text-[28px] leading-none text-warm-ivory">
          27°
        </div>
        <div className="mt-1 text-[11px] text-warm-ivory/55">Umbria</div>
      </div>
    </div>
  );
}

function PillarCard({
  n,
  name,
  status,
  tint,
}: {
  n: string;
  name: string;
  status: string;
  tint: string;
}) {
  return (
    <article
      className="relative flex h-[180px] w-[112px] flex-col border border-muted-gold/20 bg-soft-black"
      style={{
        background:
          "linear-gradient(180deg, #111113 0%, #0d0d0f 100%)",
      }}
    >
      <div className="px-3 pt-3">
        <div className="text-[10px] uppercase tracking-editorial text-warm-ivory/40">
          {n}
        </div>
        <div className="mt-2 font-serif text-[16px] leading-tight text-warm-ivory">
          {name}
        </div>
        <div className="mt-2 h-px w-5 bg-muted-gold/55" />
      </div>
      <div
        aria-hidden
        className="mt-auto h-[78px] w-full"
        style={{
          background: `radial-gradient(80% 100% at 50% 100%, ${tint}, transparent 70%), linear-gradient(180deg, #141416 0%, #0a0a0b 100%)`,
        }}
      />
      <div className="absolute inset-x-0 bottom-2 text-center text-[9px] uppercase tracking-editorial text-muted-gold/85">
        {status}
      </div>
    </article>
  );
}

function StepRow({
  text,
  tag,
  divider,
}: {
  text: string;
  tag: string;
  divider: boolean;
}) {
  return (
    <li
      className={
        "flex items-center justify-between gap-4 py-4 " +
        (divider ? "border-b border-white/[0.06]" : "")
      }
    >
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className="h-[18px] w-[18px] shrink-0 rounded-full border border-muted-gold/45"
        />
        <span className="text-[14px] leading-[1.4] text-warm-ivory/90">
          {text}
        </span>
      </div>
      <span className="shrink-0 text-[10px] uppercase tracking-editorial text-muted-gold/70">
        {tag}
      </span>
    </li>
  );
}
