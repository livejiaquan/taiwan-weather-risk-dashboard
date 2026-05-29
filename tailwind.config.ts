import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Noto Sans TC", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 18px 45px -24px rgba(15, 23, 42, 0.45)",
        card: "0 12px 32px -20px rgba(15, 23, 42, 0.35)",
      },
      colors: {
        risk: {
          safe: "#059669",
          watch: "#0284c7",
          elevated: "#d97706",
          high: "#dc2626",
          stale: "#64748b",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
