import type { Config } from "tailwindcss";

// Colors are CSS variables (RGB channels) defined in src/index.css so light and
// dark themes share one set of semantic names.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Barlow", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        bg: token("bg"),
        surface: token("surface"),
        raised: token("raised"),
        ink: token("ink"),
        muted: token("muted"),
        line: token("line"),
        accent: { DEFAULT: token("accent"), ink: token("accent-ink"), soft: token("accent-soft") },
        alarm: { DEFAULT: token("alarm"), ink: token("alarm-ink"), soft: token("alarm-soft") },
        advisory: { DEFAULT: token("advisory"), ink: token("advisory-ink"), soft: token("advisory-soft") },
        calm: { DEFAULT: token("calm"), ink: token("calm-ink") },
        unknown: { DEFAULT: token("unknown"), ink: token("unknown-ink") },
        sea: token("sea"),
      },
    },
  },
  plugins: [],
} satisfies Config;
