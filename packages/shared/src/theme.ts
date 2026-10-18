/**
 * YanaBuy v3 design tokens — one source for web, admin and mobile.
 * Matches the approved "YanaBuy v3 Redesign" canvas.
 */
export const colors = {
  ink: "#2E1440", // headings, admin sidebar, darkest purple
  purple: "#491F67", // brand purple: headers, primary buttons
  purpleLight: "#70309F",
  purpleTint: "#EFE6F6",
  amber: "#FFAC00", // goods accent
  orange: "#FF7500", // food accent
  ground: "#F7F4EF", // warm page background
  card: "#FFFFFF",
  line: "#ECE5EE",
  lineStrong: "#E0D6E6",
  text: "#2E1440",
  textSoft: "#4E4459",
  muted: "#6B6275",
  price: "#C8102E",
  success: "#1B6B45",
  successTint: "#E4F4EC",
  warn: "#6A4500",
  warnTint: "#FFF1D6",
  danger: "#C8102E",
  dangerTint: "#FDE6EA",
} as const;

export const radii = { sm: 10, md: 14, card: 18, sheet: 24, pill: 999 } as const;

export const fonts = {
  display: "Bricolage Grotesque",
  body: "Figtree",
} as const;
