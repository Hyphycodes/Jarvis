import {
  AppFrame,
  AtmosphericCard,
  BottomNav,
  Divider,
  EditorialHeader,
  FloatingMicButton,
  SectionLabel,
} from "@/components";

export default function Page() {
  const now = new Date();
  const dateLabel = now
    .toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();
  const timeLabel = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <AppFrame>
      <EditorialHeader
        meta={
          <>
            <span>{timeLabel}</span>
            <span>{dateLabel}</span>
          </>
        }
        title={
          <>
            Good evening, <em className="italic text-warm-ivory">J.</em>
          </>
        }
        subtitle="The foundation is set. The interface, the language, the feel — all in place. The day begins on your terms."
      />

      <Divider />

      <section className="flex flex-col gap-5">
        <SectionLabel trailing="Foundation">The Shell</SectionLabel>
        <AtmosphericCard bordered className="p-6">
          <p className="font-serif text-[22px] leading-[1.35] text-warm-ivory">
            Atmosphere over interface.
          </p>
          <p className="mt-3 text-[14px] leading-[1.7] text-warm-ivory/65">
            Depth, restraint, and warm light. Every surface earns its presence.
            Nothing shouts. Nothing rushes.
          </p>
        </AtmosphericCard>
      </section>

      <div className="h-10" />

      <section className="flex flex-col gap-4">
        <SectionLabel>Pillars</SectionLabel>
        <ul className="grid grid-cols-2 gap-3">
          {[
            ["01", "Lifestyle"],
            ["02", "Health"],
            ["03", "Craft"],
            ["04", "Legacy"],
          ].map(([n, name]) => (
            <li key={name}>
              <AtmosphericCard bordered className="px-4 py-5">
                <div className="text-[11px] uppercase tracking-editorial text-warm-ivory/45">
                  {n}
                </div>
                <div className="mt-2 font-serif text-[20px] text-warm-ivory">
                  {name}
                </div>
              </AtmosphericCard>
            </li>
          ))}
        </ul>
      </section>

      <div className="h-12" />

      <p className="font-serif italic text-[18px] leading-[1.5] text-warm-ivory/70">
        “We keep the world in view so you’re never disconnected from what
        matters.”
      </p>

      <BottomNav />
      <FloatingMicButton />
    </AppFrame>
  );
}
