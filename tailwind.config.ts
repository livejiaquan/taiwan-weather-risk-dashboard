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
        // System fonts, as on the JMA reference page (docs/references/tokens.md).
        sans: ["-apple-system", "system-ui", "Segoe UI", "Roboto", "Helvetica Neue", "PingFang TC", "Noto Sans TC", "Noto Sans CJK TC", "Microsoft JhengHei", "sans-serif"],
      },
      // The only type sizes allowed (px): 12 / 14 / 16 / 18 / 22 / 28 / 36 / 48 / 64.
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1.5" }],
        sm: ["0.875rem", { lineHeight: "1.6" }],
        base: ["1rem", { lineHeight: "1.5" }],
        lg: ["1.125rem", { lineHeight: "1.6" }],
        xl: ["1.375rem", { lineHeight: "1.4" }],
        "2xl": ["1.75rem", { lineHeight: "1.3" }],
        "3xl": ["2.25rem", { lineHeight: "1.2" }],
        "4xl": ["3rem", { lineHeight: "1.15" }],
        "5xl": ["4rem", { lineHeight: "1.1" }],
      },
      // Radius encodes hierarchy: controls < inner blocks < panels.
      borderRadius: {
        control: "0.25rem",
        inner: "0.75rem",
        panel: "1rem",
      },
      transitionDuration: {
        DEFAULT: "160ms",
        fast: "120ms",
        slow: "320ms",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.2, 0, 0, 1)",
      },
      minHeight: {
        touch: "2.75rem",
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
        brand: token("brand"),
        band: token("band"),
        rule: token("rule"),
        none: token("none"),
        "on-alarm": token("on-alarm"),
        "on-advisory": token("on-advisory"),
      },
    },
  },
  plugins: [],
} satisfies Config;
