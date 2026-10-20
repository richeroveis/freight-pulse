/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        abyss: "#060D1A",
        hull: "#0A1424",
        deck: "#0E1B2F",
        rail: "#1B2C44",
        ice: "#7FE3F0",
        teal: "#2DD4BF",
        coral: "#FB7185",
        amber: "#FBBF24",
        mist: "#9DB2CC",
      },
      fontFamily: {
        display: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(127, 227, 240, 0.18)",
        coral: "0 0 30px rgba(251, 113, 133, 0.22)",
      },
      keyframes: {
        drift: {
          "0%, 100%": { transform: "translate3d(0,0,0)" },
          "50%": { transform: "translate3d(0,-8px,0)" },
        },
        pulseLine: {
          "0%": { strokeDashoffset: "0" },
          "100%": { strokeDashoffset: "-48" },
        },
        scan: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(220%)" },
        },
      },
      animation: {
        drift: "drift 7s ease-in-out infinite",
        pulseLine: "pulseLine 2.4s linear infinite",
        scan: "scan 3.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
