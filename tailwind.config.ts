import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./theme/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "near-black": "var(--color-near-black)",
        "soft-black": "var(--color-soft-black)",
        charcoal: "var(--color-charcoal)",
        "warm-ivory": "var(--color-warm-ivory)",
        "muted-gold": "var(--color-muted-gold)",
        "soft-gold": "var(--color-soft-gold)",
        divider: "var(--color-divider)",
      },
      fontFamily: {
        serif: ["var(--font-serif)"],
        sans: ["var(--font-sans)"],
      },
      transitionTimingFunction: {
        atmospheric: "cubic-bezier(0.25, 0.1, 0.25, 1)",
      },
      letterSpacing: {
        editorial: "0.18em",
      },
    },
  },
  plugins: [],
};

export default config;
