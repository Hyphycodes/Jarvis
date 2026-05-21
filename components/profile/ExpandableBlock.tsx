"use client";

import { useState, type ReactNode } from "react";
import { Chevron } from "@/components/icons";

export function ExpandableBlock({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-divider/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-3 text-left"
        aria-expanded={open}
      >
        <span className="text-[11px] uppercase tracking-editorial text-warm-ivory/65">
          {label}
        </span>
        <Chevron
          direction={open ? "up" : "down"}
          size={14}
          className="text-warm-ivory/45"
        />
      </button>
      {open ? <div className="pb-5 pt-1">{children}</div> : null}
    </div>
  );
}
