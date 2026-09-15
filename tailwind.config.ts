import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: "#0B0E14",
          surface: "#11151E",
          card: "#161B26",
          border: "#202636",
          hover: "#1F2637",
          subtle: "#333D56",
          muted: "#7B849B",
          text: "#E2E8F0",
          accent: "#38BDF8",
          bullish: "#10B981",
          bullishBg: "rgba(16, 185, 129, 0.12)",
          bearish: "#F43F5E",
          bearishBg: "rgba(244, 63, 94, 0.12)",
          neutral: "#F59E0B",
          neutralBg: "rgba(245, 158, 11, 0.12)",
        }
      },
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
