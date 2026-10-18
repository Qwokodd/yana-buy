/** The shop's currency. Money is always stored as whole cents. */
export const CURRENCY = "USD";
export const CURRENCY_SYMBOL = "$";

/** Show cents as "$1,234.50" (no decimals when whole). Named formatLD for history; the app now sells in US dollars. */
export function formatLD(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  const whole = Number.isInteger(value);
  return `${CURRENCY_SYMBOL}${value.toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "70.50" or "$70.50" → 7050. Returns null for anything that isn't a positive amount. */
export function parseLD(input: string): number | null {
  const cents = Math.round(parseFloat(input.replace(/[,$\s]/g, "")) * 100);
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}
