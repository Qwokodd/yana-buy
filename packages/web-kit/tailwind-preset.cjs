/**
 * Shared Tailwind setup for the web and admin apps — colours from the v3 design.
 * Brand colours come from CSS variables so admins can change them live
 * (Admin → Branding). The defaults below are YanaBuy's own colours.
 */
const brand = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

module.exports = {
  theme: {
    extend: {
      colors: {
        ink: brand("ink"),
        purple: { DEFAULT: brand("purple"), light: brand("purple-light"), tint: brand("purple-tint") },
        amber: { DEFAULT: brand("amber"), tint: brand("amber-tint") },
        orange: { DEFAULT: brand("orange"), tint: brand("orange-tint") },
        ground: "#F7F4EF",
        line: { DEFAULT: "#ECE5EE", strong: "#E0D6E6" },
        soft: "#4E4459",
        muted: "#6B6275",
        price: "#C8102E",
        success: { DEFAULT: "#1B6B45", tint: "#E4F4EC" },
        warn: { DEFAULT: "#6A4500", tint: "#FFF1D6" },
        danger: { DEFAULT: "#C8102E", tint: "#FDE6EA" },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: { card: "18px", sheet: "24px" },
    },
  },
  plugins: [
    ({ addBase }) =>
      addBase({
        ":root": {
          "--c-ink": "46 20 64",
          "--c-purple": "73 31 103",
          "--c-purple-light": "112 48 159",
          "--c-purple-tint": "239 230 246",
          "--c-amber": "255 172 0",
          "--c-amber-tint": "255 241 214",
          "--c-orange": "255 117 0",
          "--c-orange-tint": "255 231 214",
        },
      }),
  ],
};
