/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        indigo: {
          DEFAULT: "#7030A0",
          950: "#491F68",
          900: "#7030A0",
          800: "#854FAE",
          700: "#9B6EBD",
        },
        mango: {
          DEFAULT: "#FFB400",
          400: "#FFBF26",
          500: "#FFB400",
          600: "#D99900",
        },
        coral: {
          DEFAULT: "#C8102E",
          500: "#C8102E",
          600: "#A80D26",
        },
        teal: {
          DEFAULT: "#1F7A4D",
          500: "#1F7A4D",
          600: "#166339",
        },
        ink: "#16162B",
        paper: "#FFFDF9",
        sand: "#F1EFE6",
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        body: ["Manrope", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(22,22,43,0.04), 0 8px 24px -8px rgba(22,22,43,0.08)",
        card: "0 2px 4px rgba(22,22,43,0.04), 0 16px 32px -12px rgba(22,22,43,0.12)",
        lift: "0 8px 16px -4px rgba(22,22,43,0.10), 0 24px 48px -16px rgba(22,22,43,0.16)",
        glow: "0 0 0 1px rgba(11,166,160,0.15), 0 8px 24px -8px rgba(11,166,160,0.25)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      backgroundImage: {
        "grad-indigo": "linear-gradient(135deg, #491F68 0%, #7030A0 60%, #9B6EBD 100%)",
        "grad-sand": "linear-gradient(180deg, #FFFDF9 0%, #F1EFE6 100%)",
      },
    },
  },
  plugins: [],
};
