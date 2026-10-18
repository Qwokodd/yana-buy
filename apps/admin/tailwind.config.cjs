module.exports = {
  presets: [require("../../packages/web-kit/tailwind-preset.cjs")],
  content: ["./src/**/*.{ts,tsx}", "../../packages/web-kit/src/**/*.{ts,tsx}"],
  plugins: [],
};
