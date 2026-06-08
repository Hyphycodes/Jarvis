"use client";

import { useState, useTransition } from "react";
import { updateSpend } from "@/lib/actions/operatingPreferences";
import {
  SPEND_MODES,
  FINDS_COMFORTS,
  comfortLabel,
  formatIncomeRange,
  type OperatingPreferences,
  type SpendMode,
  type FindsComfort,
  type AspirationalFrequency,
} from "@/lib/operating/operatingPreferences";
import {
  SettingsCard,
  Chip,
  SummaryRow,
  TextButton,
  Sheet,
  FieldLabel,
  NumberField,
  SaveButton,
} from "./ui";

const FREQ: ReadonlyArray<{ key: AspirationalFrequency; label: string }> = [
  { key: "rare_unless_requested", label: "Rare" },
  { key: "occasional", label: "Occasional" },
  { key: "open_when_requested", label: "On request" },
];

export function SpendCard({
  initial,
  editable,
}: {
  initial: OperatingPreferences;
  editable: boolean;
}) {
  const [p, setP] = useState(initial);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Draft state inside the sheet.
  const [spendMode, setSpendMode] = useState<SpendMode>(p.spendMode);
  const [findsComfort, setFindsComfort] = useState<FindsComfort>(p.findsComfort);
  const [aspFreq, setAspFreq] = useState<AspirationalFrequency>(p.aspirationalFrequency);
  const [premiumThreshold, setPremiumThreshold] = useState<number | null>(p.premiumThreshold);
  const [dnMin, setDnMin] = useState<number | null>(p.diningNormalMin);
  const [dnMax, setDnMax] = useState<number | null>(p.diningNormalMax);
  const [dpMin, setDpMin] = useState<number | null>(p.diningPremiumMin);
  const [dpMax, setDpMax] = useState<number | null>(p.diningPremiumMax);

  function openSheet() {
    setSpendMode(p.spendMode);
    setFindsComfort(p.findsComfort);
    setAspFreq(p.aspirationalFrequency);
    setPremiumThreshold(p.premiumThreshold);
    setDnMin(p.diningNormalMin);
    setDnMax(p.diningNormalMax);
    setDpMin(p.diningPremiumMin);
    setDpMax(p.diningPremiumMax);
    setError(null);
    setOpen(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await updateSpend({
          spendMode,
          findsComfort,
          aspirationalFrequency: aspFreq,
          premiumThreshold: premiumThreshold ?? undefined,
          diningNormalMin: dnMin,
          diningNormalMax: dnMax,
          diningPremiumMin: dpMin,
          diningPremiumMax: dpMax,
        });
        setP((prev) => ({
          ...prev,
          spendMode,
          findsComfort,
          aspirationalFrequency: aspFreq,
          premiumThreshold: premiumThreshold ?? prev.premiumThreshold,
          diningNormalMin: dnMin,
          diningNormalMax: dnMax,
          diningPremiumMin: dpMin,
          diningPremiumMax: dpMax,
        }));
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save spend.");
      }
    });
  }

  const dining =
    p.diningNormalMin != null && p.diningNormalMax != null
      ? `$${p.diningNormalMin}–${p.diningNormalMax}`
      : "—";
  const diningPrem =
    p.diningPremiumMin != null && p.diningPremiumMax != null
      ? `$${p.diningPremiumMin}–${p.diningPremiumMax}`
      : "—";

  return (
    <SettingsCard
      label="Spend posture"
      title={spendModeLabel(p.spendMode)}
      action={editable ? <TextButton onClick={openSheet}>Adjust</TextButton> : null}
    >
      <p className="text-[14px] leading-[1.5] text-warm-ivory/65">
        Quality over cheapness — aspirational luxury stays {freqShort(p.aspirationalFrequency)} unless asked.
      </p>
      <div className="mt-3">
        <SummaryRow label="Income" value={formatIncomeRange(p.annualIncomeRange) ?? "—"} />
        <SummaryRow label="Product comfort" value={titleCase(comfortLabel(p.findsComfort))} />
        <SummaryRow label="Premium threshold" value={`ask harder above $${p.premiumThreshold}`} />
        <SummaryRow label="Normal dining" value={dining} />
        <SummaryRow label="Premium dining" value={diningPrem} />
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Spend posture">
        <FieldLabel>How should Jarvis spend?</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {SPEND_MODES.map((m) => (
            <Chip key={m.key} active={m.key === spendMode} onClick={() => setSpendMode(m.key)}>
              {m.label}
            </Chip>
          ))}
        </div>

        <FieldLabel>Product comfort</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {FINDS_COMFORTS.map((c) => (
            <Chip key={c.key} active={c.key === findsComfort} onClick={() => setFindsComfort(c.key)}>
              {c.label}
            </Chip>
          ))}
        </div>

        <FieldLabel>Aspirational luxury</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {FREQ.map((f) => (
            <Chip key={f.key} active={f.key === aspFreq} onClick={() => setAspFreq(f.key)}>
              {f.label}
            </Chip>
          ))}
        </div>

        <FieldLabel>Premium threshold</FieldLabel>
        <NumberField
          label="Ask harder above"
          value={premiumThreshold}
          onChange={setPremiumThreshold}
          prefix="$"
        />

        <FieldLabel>Normal dining</FieldLabel>
        <div className="flex gap-3">
          <NumberField label="Min" value={dnMin} onChange={setDnMin} prefix="$" />
          <NumberField label="Max" value={dnMax} onChange={setDnMax} prefix="$" />
        </div>

        <FieldLabel>Premium dining</FieldLabel>
        <div className="flex gap-3">
          <NumberField label="Min" value={dpMin} onChange={setDpMin} prefix="$" />
          <NumberField label="Max" value={dpMax} onChange={setDpMax} prefix="$" />
        </div>

        {error ? <p className="mt-3 text-[12px] text-[#E07A6E]">{error}</p> : null}
        <SaveButton onClick={save} pending={pending} />
      </Sheet>
    </SettingsCard>
  );
}

function spendModeLabel(m: SpendMode): string {
  return SPEND_MODES.find((x) => x.key === m)?.label ?? m;
}
function freqShort(f: AspirationalFrequency): string {
  return f === "rare_unless_requested" ? "rare" : f === "occasional" ? "occasional" : "available";
}
function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
