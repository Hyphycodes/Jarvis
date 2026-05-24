import "server-only";

import { buildBrainContext } from "@/lib/brain/context";
import type { JarvisContext } from "@/lib/intelligence/types";
import type { IndexedItem } from "@/lib/index/types";

export async function buildJarvisContext(input: {
  currentRadarItems?: IndexedItem[];
} = {}): Promise<JarvisContext> {
  const context = await buildBrainContext();
  return {
    ...context,
    currentRadarItems: input.currentRadarItems,
    activeRadarCount: input.currentRadarItems?.length,
  };
}

