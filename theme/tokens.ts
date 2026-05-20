export const colors = {
  nearBlack: "#0A0A0B",
  softBlack: "#111113",
  charcoal: "#1A1A1C",
  warmIvory: "#F0ECD8",
  mutedGold: "#B8924A",
  softGold: "#C9A96E",
  divider: "#2A2A2E",
  overlay: "rgba(0,0,0,0.6)",
} as const;

export const typography = {
  serif: '"DM Serif Display", "Times New Roman", serif',
  sans: '"Neue Haas Grotesk", "Inter", system-ui, -apple-system, sans-serif',
  scale: {
    h1: { size: "72px", lh: "1.1" },
    h2: { size: "40px", lh: "1.2" },
    h3: { size: "28px", lh: "1.3" },
    h4: { size: "18px", lh: "1.4" },
    body: { size: "16px", lh: "1.6" },
    bodySmall: { size: "14px", lh: "1.6" },
    label: { size: "12px", lh: "1.4" },
    meta: { size: "11px", lh: "1.4" },
  },
} as const;

export const spacing = {
  base: 8,
  scale: [4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96] as const,
} as const;

export const motion = {
  easeAtmospheric: "cubic-bezier(0.25, 0.1, 0.25, 1)",
  durationSlow: "800ms",
  durationDefault: "500ms",
  durationFast: "300ms",
} as const;

export const borders = {
  hairline: `1px solid ${colors.divider}`,
  radius: {
    sm: "4px",
    md: "8px",
    lg: "12px",
    pill: "999px",
  },
} as const;

export const shadows = {
  atmospheric: "0 24px 64px -16px rgba(0,0,0,0.7)",
  lift: "0 8px 24px -8px rgba(0,0,0,0.5)",
} as const;
