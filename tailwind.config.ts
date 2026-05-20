import type { Config } from "tailwindcss";

// Foundation config only. Design tokens and theme will be defined later
// in /theme. Do not encode product design decisions here.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./theme/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
