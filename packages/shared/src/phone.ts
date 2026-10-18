/**
 * Phone numbers are stored in one international format:
 *  - Liberia: +231 then the national number (e.g. +231888777999). People can
 *    type +231…, 00231…, 231…, 0… or the bare number.
 *  - USA: +1 then 10 digits (e.g. +12155550123). People can type +1…, 1…, or
 *    the 10-digit number.
 * Spaces, dashes, dots and brackets are ignored. Liberian numbers never have
 * 10 digits without a leading 0, and US area codes never start with 0 or 1, so
 * the two can't be confused.
 */
export function normalizePhone(input: string): string | null {
  let digits = input.trim().replace(/[\s\-().]/g, "");

  let international = false;
  if (digits.startsWith("+")) {
    digits = digits.slice(1);
    international = true;
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
    international = true;
  }
  if (!/^\d+$/.test(digits)) return null;

  // USA / NANP
  const us = /^1([2-9]\d{2}[2-9]\d{6})$/.exec(digits) ?? (!international ? /^([2-9]\d{2}[2-9]\d{6})$/.exec(digits) : null);
  if (us) return `+1${us[1]}`;

  if (international && !digits.startsWith("231")) return null;
  let national = digits.startsWith("231") && digits.length >= 10 ? digits.slice(3) : digits;
  if (national.startsWith("0")) national = national.slice(1);
  if (!/^\d{7,9}$/.test(national)) return null;
  return `+231${national}`;
}

/** @deprecated use normalizePhone — kept because many screens import it. Accepts Liberian and US numbers. */
export const normalizeLiberianPhone = normalizePhone;

/** +231888777999 → "0888 777 999"; +12155550123 → "(215) 555-0123". */
export function formatPhone(e164: string): string {
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (us) return `(${us[1]}) ${us[2]}-${us[3]}`;
  const national = e164.replace(/^\+231/, "0");
  return national.replace(/^(\d{4})(\d{3})(\d+)$/, "$1 $2 $3");
}

/** @deprecated use formatPhone. Formats Liberian and US numbers. */
export const formatLiberianPhone = formatPhone;

/** Which country a stored number belongs to. */
export const phoneCountry = (e164: string): "LR" | "US" | null => (e164.startsWith("+1") ? "US" : e164.startsWith("+231") ? "LR" : null);
