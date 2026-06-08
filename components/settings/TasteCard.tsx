"use client";

import { FounderEditableTagList } from "@/components/profile/ProfileFields";
import { SettingsCard } from "./ui";

/**
 * Taste — a refined summary, not a database. Likes/avoids are the declared taste
 * arrays (vibe_keywords / avoid_keywords) that feed the Taste context + council.
 */
export function TasteCard({
  likes,
  avoids,
  editable,
}: {
  likes: string[];
  avoids: string[];
  editable: boolean;
}) {
  return (
    <SettingsCard label="What Jarvis understands" title="Taste">
      <p className="mb-3 text-[14px] leading-[1.5] text-warm-ivory/65">
        Polished but relaxed. Subtle luxury, never flashy. Quality over quantity.
      </p>
      <div className="flex flex-col gap-4">
        <FounderEditableTagList
          label="Leans into"
          value={likes}
          field="vibe_keywords"
          editable={editable}
          placeholder="Add what he likes"
        />
        <FounderEditableTagList
          label="Avoids"
          value={avoids}
          field="avoid_keywords"
          editable={editable}
          muted
          placeholder="Add what to avoid"
        />
      </div>
    </SettingsCard>
  );
}
