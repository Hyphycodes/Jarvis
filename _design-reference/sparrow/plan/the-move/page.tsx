import { DeepSectionFrame, DeepHeader } from "@/components";

type Beat = {
  time: string;
  title: string;
  body: string;
};

const BEATS: Beat[] = [
  {
    time: "7:42 PM",
    title: "Leave the house",
    body: "Lights low. Jacket on. Valet ticket already in the pocket.",
  },
  {
    time: "8:10 PM",
    title: "Hand off the car",
    body: "Garage entrance on W. Division. Ask for Marco when you walk in.",
  },
  {
    time: "8:30 PM",
    title: "Seated",
    body: "Patio if the night is dry. Otherwise the corner table — quieter, better light.",
  },
  {
    time: "8:45 PM",
    title: "First pour",
    body: "Sparkling to start. Tell the somm second cheapest on the natural wine page.",
  },
  {
    time: "9:15 PM",
    title: "First course",
    body: "Don’t rush the menu. Order in pairs and share. Ask for extra lemon olive oil.",
  },
  {
    time: "10:30 PM",
    title: "Coffee or move on",
    body: "Espresso here, or step into Optional Detours. The night can open up.",
  },
  {
    time: "11:00 PM",
    title: "Walk home",
    body: "Route clears by 11:15. North on Halsted, east on Division.",
  },
];

export default function TheMovePage() {
  return (
    <DeepSectionFrame eyebrow="The Move">
      <DeepHeader
        title="How the night moves."
        subtitle={
          <>
            The flow of the evening, step by step.
            <br />
            Not a script — a shape to lean into.
          </>
        }
        meta="Sparrow · Tonight · 8:30 PM"
      />

      <section className="mt-8">
        <ol className="relative">
          <span
            aria-hidden
            className="absolute left-[68px] top-2 bottom-2 w-px bg-warm-ivory/15"
          />
          {BEATS.map((b, i) => (
            <li key={b.time} className="relative">
              <div className="grid grid-cols-[64px_20px_1fr] items-start gap-x-4 py-5">
                <div className="pt-[2px] text-[11px] uppercase tracking-editorial text-muted-gold/85">
                  {b.time}
                </div>
                <div className="flex justify-center pt-[6px]">
                  <span
                    className={
                      "h-2.5 w-2.5 rounded-full border " +
                      (i === 0
                        ? "border-muted-gold bg-muted-gold"
                        : "border-warm-ivory/45")
                    }
                  />
                </div>
                <div>
                  <div className="font-serif text-[20px] leading-tight text-warm-ivory">
                    {b.title}
                  </div>
                  <p className="mt-1.5 font-serif text-[14px] italic leading-[1.5] text-warm-ivory/65">
                    {b.body}
                  </p>
                </div>
              </div>
              {i !== BEATS.length - 1 ? (
                <div className="ml-[88px] h-px bg-white/[0.06]" />
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-10 h-px w-full bg-white/[0.06]" />

      <p className="mt-6 text-center font-serif text-[15px] italic text-warm-ivory/65">
        Don’t force the order. Let one beat fold into the next.
      </p>
    </DeepSectionFrame>
  );
}
