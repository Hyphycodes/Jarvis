import "server-only";

import { scoreAgainstTasteConstitution } from "@/lib/brain/tasteConstitution";
import type { IndexedItem } from "@/lib/index/types";
import type { JarvisContext, TasteRead } from "@/lib/intelligence/types";

export function readTaste(item: IndexedItem, context?: JarvisContext): TasteRead {
  const taste = scoreAgainstTasteConstitution(item, context);
  return {
    ...taste,
    belongs: taste.score >= 0.62 && taste.negativeFlags.length === 0,
  };
}

