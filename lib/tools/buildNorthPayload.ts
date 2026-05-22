import type { NorthPayload } from "@/lib/ai/types";

export function buildNorthPayload(input?: Partial<NorthPayload>): NorthPayload {
  return {
    northStar: {
      title: input?.northStar?.title ?? "",
      subtitle: input?.northStar?.subtitle ?? "North star not set yet.",
      headingDegrees: input?.northStar?.headingDegrees,
    },
    pillars: input?.pillars ?? [],
    signals: input?.signals ?? [],
    lifeCadence: input?.lifeCadence ?? [],
  };
}
