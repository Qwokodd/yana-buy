import { brandPalette, colors as defaults, type BrandColors } from "@yanabuy/shared";

/**
 * The colours every screen reads while drawing. They start as YanaBuy's own
 * and are replaced with the admin's branding when the app opens (see
 * lib/branding.tsx). Screens read `colors.x` when they render — never copy
 * them into a StyleSheet at load time, or branding changes won't show.
 */
export const colors: { -readonly [K in keyof typeof defaults]: string } = { ...defaults };

export function applyBrandColors(c: BrandColors) {
  const p = brandPalette(c);
  colors.ink = p.ink;
  colors.text = p.ink;
  colors.purple = p.purple;
  colors.purpleLight = p.purpleLight;
  colors.purpleTint = p.purpleTint;
  colors.amber = p.amber;
  colors.orange = p.orange;
}

export const font = {
  display: "BricolageGrotesque_800ExtraBold",
  displaySemi: "BricolageGrotesque_600SemiBold",
  regular: "Figtree_400Regular",
  medium: "Figtree_500Medium",
  semibold: "Figtree_600SemiBold",
  bold: "Figtree_700Bold",
  extrabold: "Figtree_800ExtraBold",
};
