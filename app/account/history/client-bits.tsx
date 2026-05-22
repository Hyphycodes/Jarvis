"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function RestoreItemButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const restore = () => {
    startTransition(async () => {
      const res = await fetch(`/api/items/${itemId}/restore`, {
        method: "POST",
      });
      if (!res.ok) return;
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={restore}
      disabled={pending}
      className="shrink-0 rounded-full border border-white/[0.08] px-3 py-1 text-[11px] uppercase tracking-editorial text-warm-ivory/65 transition-colors duration-300 ease-atmospheric hover:bg-white/[0.03] disabled:opacity-50"
    >
      Restore
    </button>
  );
}
