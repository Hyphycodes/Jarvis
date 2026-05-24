import "server-only";

import type { JarvisCopy, SignalProfile, TruthRead } from "@/lib/intelligence/types";

export function composeSurfaceCopy(input: {
  signal: SignalProfile;
  truth: TruthRead;
}): JarvisCopy {
  const { signal, truth } = input;
  const missing =
    truth.missingDetails.length > 0
      ? `Missing: ${truth.missingDetails.slice(0, 2).join(", ")}.`
      : "";
  const nonUrgentActiveAngle = /not urgent|no rush|holding|hold/i.test(signal.strongestAngle)
    ? nonUrgentRadarCopy(signal)
    : signal.strongestAngle;
  return {
    title: signal.moveTitle,
    oneLine: signal.reasonSurfaced,
    reasonSurfaced: signal.reasonSurfaced,
    strongestAngle: nonUrgentActiveAngle,
    nextMove:
      signal.suggestedAction === "plan"
        ? "Open the plan path."
        : signal.suggestedAction === "hold" || signal.suggestedAction === "research"
          ? nonUrgentActiveAngle || missing || "Worth keeping in view."
          : nonUrgentActiveAngle,
  };
}

function nonUrgentRadarCopy(signal: SignalProfile): string {
  if (/golf|horse|outdoor|weekend|activity/i.test(`${signal.category} ${signal.moveTitle}`)) {
    return "Good weekend lane. Not urgent, but strong enough to stay visible.";
  }
  if (/creative|style|idea|ownership|land/i.test(`${signal.category} ${signal.purposeLabel}`)) {
    return "Worth keeping in view while the lane is warm.";
  }
  return "Not urgent, but strong enough to stay visible.";
}
