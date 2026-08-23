import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Noto Sans TC", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#10211C",
        paper: "#F6F7F2",
        line: "#C8D3CA",
        teal: {
          50: "#E8F4F1",
          100: "#D0E8E2",
          600: "#0F766E",
          700: "#0B5F59",
          800: "#084C47",
          900: "#063C38",
        },
        cobalt: {
          50: "#EEF4FF",
          100: "#D9E7FF",
          600: "#2563EB",
          700: "#1D4ED8",
          800: "#1E40AF",
        },
        sky: {
          50: "#F0F9FF",
          100: "#E0F2FE",
          600: "#0284C7",
          700: "#0369A1",
        },
      },
      boxShadow: {
        soft: "0 18px 45px -30px rgba(16, 33, 28, 0.32)",
        card: "0 10px 25px -22px rgba(16, 33, 28, 0.28)",
      },
    },
  },
  plugins: [],
} satisfies Config;
