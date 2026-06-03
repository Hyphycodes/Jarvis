export type RadarAutopilotRunMode =
  | "scheduled"
  | "bootstrap"
  | "owner_requested"
  | "manual_force";

export function normalizeAutopilotMode(mode?: string | null): RadarAutopilotRunMode {
  if (mode === "bootstrap") return "bootstrap";
  if (mode === "manual_force") return "manual_force";
  if (mode === "owner_requested") return "owner_requested";
  return "scheduled";
}

export function isScheduledMode(mode: RadarAutopilotRunMode): boolean {
  return mode === "scheduled";
}

export function isPausedForMode(input: {
  mode: RadarAutopilotRunMode;
  enabled: boolean;
  force?: boolean;
}): boolean {
  return isScheduledMode(input.mode) && !input.enabled && !input.force;
}
