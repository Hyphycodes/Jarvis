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
  return {
    title: signal.moveTitle,
    oneLine: signal.reasonSurfaced,
    reasonSurfaced: signal.reasonSurfaced,
    strongestAngle: signal.strongestAngle,
    nextMove:
      signal.suggestedAction === "plan"
        ? "Open the plan path."
        : signal.suggestedAction === "hold" || signal.suggestedAction === "research"
          ? missing || "Hold until one more detail is clear."
          : signal.strongestAngle,
  };
}

