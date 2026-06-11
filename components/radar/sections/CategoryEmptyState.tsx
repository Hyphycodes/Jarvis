"use client";

import {
  RADAR_CATEGORY_COPY,
  type RadarFilterKey,
} from "@/lib/radar/categoryCopy";

/**
 * Category-voiced empty state. Rendered only when the entire page has nothing
 * — never alongside real content.
 */
export function CategoryEmptyState({ filter }: { filter: RadarFilterKey }) {
  return (
    <div className="px-6 py-24 text-center">
      <p className="mx-auto max-w-[30ch] font-serif text-[24px] italic leading-[1.35] text-warm-ivory/55">
        {RADAR_CATEGORY_COPY[filter].empty}
      </p>
    </div>
  );
}
