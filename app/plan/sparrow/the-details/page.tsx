import Link from "next/link";
import { DeepSectionFrame, DeepHeader } from "@/components";
import {
  ArrowRight,
  Bell,
  Clock,
  Fork,
  Jacket,
  MapPin,
  Receipt,
  Ticket,
  User,
} from "@/components/icons";

export default function TheDetailsPage() {
  return (
    <DeepSectionFrame eyebrow="The Details">
      <DeepHeader
        title="Everything, precisely."
        subtitle="The specifics that make the night effortless."
        meta="Sparrow · Tonight · 8:30 PM"
      />

      {/* THE ESSENTIALS */}
      <section className="mt-8">
        <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
          The Essentials
        </h2>
        <div className="mt-3 grid grid-cols-3 border border-white/[0.06]">
          <Essential
            icon={<MapPin size={14} className="text-muted-gold" />}
            label="Address"
            primary={
              <>
                955 W. Randolph St.
                <br />
                Chicago, IL 60607
              </>
            }
            sub="West Loop"
          />
          <Essential
            icon={<Clock size={14} className="text-muted-gold" />}
            label="Reservation"
            primary={
              <>
                8:30 PM, Table for 2<br />
                Under your name
              </>
            }
            sub={
              <>
                Confirmation
                <br />
                #S-830-5192
              </>
            }
          />
          <Essential
            icon={<Bell size={14} className="text-muted-gold" />}
            label="Parking"
            primary={
              <>
                Valet on-site
                <br />
                $16
              </>
            }
            sub={
              <>
                Garage entrance on
                <br />
                W. Division
              </>
            }
          />
          <Essential
            icon={<Clock size={14} className="text-muted-gold" />}
            label="Hours"
            primary={
              <>
                Mon – Thu 5PM – 11PM
                <br />
                Fri – Sat 5PM – 12AM
                <br />
                Sun 5PM – 10PM
              </>
            }
          />
          <Essential
            icon={<User size={14} className="text-muted-gold" />}
            label="Contact"
            primary={<>(312) 527-1955</>}
            sub={
              <>
                Call for same-day changes
                <br />
                or special requests
              </>
            }
          />
          <Essential
            icon={<Jacket size={14} className="text-muted-gold" />}
            label="Dress Code"
            primary={
              <>
                Smart casual.
                <br />
                Keep it understated.
              </>
            }
            sub="The room is dim."
          />
        </div>
      </section>

      {/* THE PRACTICALS */}
      <section className="mt-10">
        <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
          The Practicals
        </h2>
        <div className="mt-4 grid grid-cols-[1fr_1.05fr] gap-4">
          <ul className="flex flex-col divide-y divide-white/[0.06]">
            <Practical
              icon={<Fork size={14} className="text-muted-gold" />}
              label="Dietary Notes"
              body="No shellfish. Prefer red meat and seasonal vegetables."
            />
            <Practical
              icon={<Ticket size={14} className="text-muted-gold" />}
              label="Payment"
              body="Cards only"
              note="No Amex"
            />
            <Practical
              icon={<User size={14} className="text-muted-gold" />}
              label="Party"
              body="You + 1"
              note="Guest: Alex"
            />
            <Practical
              icon={<Bell size={14} className="text-muted-gold" />}
              label="Manager"
              body="Marco"
              note="Ask for him if you need anything."
            />
            <Practical
              icon={<Receipt size={14} className="text-muted-gold" />}
              label="Special Request"
              body="Patio if available"
              note="Anniversary ambiance"
            />
            <Practical
              icon={<Receipt size={14} className="text-muted-gold" />}
              label="Weather"
              body={
                <>
                  Rain clears by 7:10 PM
                  <br />
                  Low 57° / High 61°
                </>
              }
              note="Light jacket weather"
            />
          </ul>
          <div className="flex flex-col gap-3">
            <div
              aria-hidden
              className="aspect-[4/5] w-full border border-white/[0.06]"
              style={{
                background:
                  "linear-gradient(135deg, rgba(184,146,74,0.06), transparent 60%), linear-gradient(180deg, #141416 0%, #0a0a0b 100%)",
              }}
            />
            <div className="border border-white/[0.06] bg-soft-black/70 p-3">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-editorial text-muted-gold">
                <span
                  aria-hidden
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-muted-gold/50"
                >
                  <Fork size={10} />
                </span>
                7 Min Walk From Valet
              </div>
              <p className="mt-2 text-[12px] leading-[1.5] text-warm-ivory/70">
                0.3 mi · Mostly along W. Randolph and N. Halsted
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* BACKUP PLAN */}
      <section className="mt-10">
        <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
          Backup Plan
        </h2>
        <div className="mt-3 grid grid-cols-[120px_1fr] border border-white/[0.06]">
          <div
            aria-hidden
            className="h-full min-h-[120px]"
            style={{
              background:
                "radial-gradient(80% 80% at 50% 60%, rgba(184,146,74,0.10), transparent 60%), linear-gradient(180deg, #16161a 0%, #0a0a0b 100%)",
            }}
          />
          <div className="grid grid-cols-3 gap-4 p-4">
            <div>
              <div className="text-[10px] uppercase tracking-editorial text-muted-gold">
                If plans shift
              </div>
              <div className="mt-1 font-serif text-[18px] italic leading-tight text-warm-ivory">
                Dove &amp; Lark
              </div>
              <div className="mt-1 text-[12px] leading-[1.45] text-warm-ivory/65">
                154 N. Peoria St.
                <br />
                Chicago, IL 60607
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-editorial text-muted-gold">
                ~4 Min Walk
              </div>
              <div className="mt-1 text-[12px] text-warm-ivory/75">
                From Sparrow
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-editorial text-muted-gold">
                Reservation
              </div>
              <div className="mt-1 font-serif text-[15px] leading-tight text-warm-ivory">
                9:30 PM Hold
              </div>
              <div className="mt-1 text-[12px] text-warm-ivory/65">
                Under your name
              </div>
            </div>
          </div>
        </div>
      </section>

      <Link
        href="/active/sparrow"
        className="mt-10 flex items-center justify-center gap-2 py-2 text-[12px] uppercase tracking-editorial text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold"
      >
        Begin Evening <ArrowRight size={14} />
      </Link>
    </DeepSectionFrame>
  );
}

function Essential({
  icon,
  label,
  primary,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  primary: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="border-b border-r border-white/[0.06] p-4 last:border-r-0 [&:nth-child(3n)]:border-r-0 [&:nth-last-child(-n+3)]:border-b-0">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-editorial text-muted-gold">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-[13px] leading-[1.45] text-warm-ivory/90">
        {primary}
      </div>
      {sub ? (
        <div className="mt-2 font-serif text-[12px] italic leading-[1.45] text-warm-ivory/55">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function Practical({
  icon,
  label,
  body,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  body: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 py-4">
      <span className="mt-[3px]">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-editorial text-muted-gold">
          {label}
        </div>
        <div className="mt-1 text-[13px] leading-[1.45] text-warm-ivory/90">
          {body}
        </div>
        {note ? (
          <div className="mt-1 font-serif text-[12px] italic text-warm-ivory/55">
            {note}
          </div>
        ) : null}
      </div>
    </li>
  );
}
