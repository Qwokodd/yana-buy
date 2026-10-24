import { gramsToUnit, unitToGrams, type WeightUnit } from "./delivery-fee";
import { parseLD } from "./money";
import { variantLabel, type MyProduct, type ProductInput, type ProductOption, type ProductVariant } from "./types";

/** Helpers for the colour/size pickers on the website and phone app. */

type WithVariants = { options: ProductOption[]; variants: ProductVariant[] };

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The variant matching every picked value, or null if something isn't picked yet / doesn't exist. */
export function findVariant(p: WithVariants, picked: (string | null)[]): ProductVariant | null {
  if (!p.variants.length || picked.some((v) => !v)) return null;
  return p.variants.find((v) => v.values.every((x, i) => eq(x, picked[i]!))) ?? null;
}

/** Start with the first choice that's in stock (or the first one at all). */
export function defaultPick(p: WithVariants): (string | null)[] {
  if (!p.variants.length) return [];
  const v = p.variants.find((x) => x.stock === null || x.stock > 0) ?? p.variants[0];
  return [...v.values];
}

/**
 * How a value looks in the picker, given the other picks:
 * "ok" — can be bought, "soldout" — exists but none left, "none" — no such combination.
 */
export function valueState(p: WithVariants, picked: (string | null)[], optionIndex: number, value: string): "ok" | "soldout" | "none" {
  const matches = p.variants.filter((v) =>
    v.values.every((x, i) => (i === optionIndex ? eq(x, value) : !picked[i] || eq(x, picked[i]!)))
  );
  if (!matches.length) return "none";
  return matches.some((v) => v.stock === null || v.stock > 0) ? "ok" : "soldout";
}

/** Picking a value: keep the other picks if that combination exists, otherwise jump to one that does. */
export function pickValue(p: WithVariants, picked: (string | null)[], optionIndex: number, value: string): (string | null)[] {
  const next = [...picked];
  next[optionIndex] = value;
  if (findVariant(p, next)) return next;
  const fallback =
    p.variants.find((v) => eq(v.values[optionIndex], value) && (v.stock === null || v.stock > 0)) ??
    p.variants.find((v) => eq(v.values[optionIndex], value));
  return fallback ? [...fallback.values] : next;
}

/** Every combination of the options, e.g. for the seller's price table. */
export function combinations(options: ProductOption[]): string[][] {
  return options.reduce<string[][]>((acc, o) => acc.flatMap((row) => o.values.map((v) => [...row, v])), [[]]).filter((r) => r.length > 0);
}

// ─── The seller's options form (website and phone share this) ───

export interface OptionDraft {
  name: string;
  /** "Red, Blue, Green" */
  values: string;
}
export interface RowDraft {
  id?: string;
  /** Kept from the product (e.g. imported from Shopify). */
  image?: string | null;
  on: boolean;
  price: string;
  compareAtPrice: string;
  stock: string;
  /** Weight of one in the seller's unit (kg or lb). Empty = the product's weight. */
  weight?: string;
}
export interface OptionsDraft {
  options: OptionDraft[];
  rows: Record<string, RowDraft>;
  /** The choices the product had when the form opened (lowercase, per option). */
  initial?: string[][];
}

const toInput = (cents: number | null | undefined) => (cents ? (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2, useGrouping: false }) : "");
const split = (s: string) => [...new Set(s.split(",").map((v) => v.trim()).filter(Boolean))];
export const rowKey = (values: string[]) => values.map((v) => v.toLowerCase()).join("\u0000");

/**
 * A combination nobody has filled in yet. When editing, combinations the product
 * didn't sell before start unticked — unless they use a newly added choice.
 */
export function defaultRow(d: OptionsDraft, values: string[]): RowDraft {
  const isNew = !d.initial || values.some((v, i) => !d.initial![i]?.includes(v.toLowerCase()));
  return { on: isNew, price: "", compareAtPrice: "", stock: "", weight: "" };
}

export const rowOf = (d: OptionsDraft, values: string[]): RowDraft => d.rows[rowKey(values)] ?? defaultRow(d, values);

/** A weight in grams as the seller types it in their unit ("1.5"), or "". */
export const weightToInput = (grams: number | null | undefined, unit: WeightUnit) => (grams ? String(Math.round(gramsToUnit(grams, unit) * 100) / 100) : "");

export function draftFrom(product: MyProduct | null, weightUnit: WeightUnit = "kg"): OptionsDraft {
  if (!product?.variants.length) return { options: [], rows: {} };
  const rows: Record<string, RowDraft> = {};
  for (const v of product.variants) {
    rows[rowKey(v.values)] = {
      id: v.id,
      image: v.image,
      on: true,
      price: toInput(v.price),
      compareAtPrice: toInput(v.compareAtPrice),
      stock: v.stock === null ? "" : String(v.stock),
      weight: weightToInput(v.weightGrams, weightUnit),
    };
  }
  return {
    options: product.options.map((o) => ({ name: o.name, values: o.values.join(", ") })),
    rows,
    initial: product.options.map((o) => o.values.map((v) => v.toLowerCase())),
  };
}

export const cleanOptions = (d: OptionsDraft) => d.options.map((o) => ({ name: o.name.trim(), values: split(o.values) })).filter((o) => o.name || o.values.length);

/** Turns the draft into what the API wants, or field errors. Weights are read in `weightUnit`. */
export function collectOptions(d: OptionsDraft, weightUnit: WeightUnit = "kg"): { value: Pick<ProductInput, "options" | "variants">; error: string | null } {
  const options = cleanOptions(d);
  if (!options.length) return { value: { options: [], variants: [] }, error: null };
  if (options.some((o) => !o.name)) return { value: {}, error: "Give every option a name, e.g. Colour" };
  if (options.some((o) => !o.values.length)) return { value: {}, error: "Add the choices for every option, separated by commas" };
  const variants: NonNullable<ProductInput["variants"]> = [];
  for (const values of combinations(options)) {
    const r = rowOf(d, values);
    if (!r.on) continue;
    const price = parseLD(r.price);
    if (!price) return { value: {}, error: `Enter a price for ${variantLabel(values)} (or untick it)` };
    const compare = r.compareAtPrice.trim() ? parseLD(r.compareAtPrice) : null;
    if (r.compareAtPrice.trim() && (!compare || compare <= price)) return { value: {}, error: `${variantLabel(values)}: the old price must be higher than the price` };
    const stock = r.stock.trim() === "" ? null : Number(r.stock);
    if (stock !== null && (!Number.isInteger(stock) || stock < 0)) return { value: {}, error: `${variantLabel(values)}: stock must be a whole number` };
    const w = (r.weight ?? "").trim() === "" ? null : Number(r.weight);
    const weightGrams = w === null ? null : Math.round(unitToGrams(w, weightUnit));
    if (w !== null && (!Number.isFinite(w) || weightGrams! < 1 || weightGrams! > 1_000_000)) return { value: {}, error: `${variantLabel(values)}: enter the weight in ${weightUnit}, e.g. 1.5, or leave it empty` };
    variants.push({ id: r.id, values, price, compareAtPrice: compare, stock, image: r.image ?? null, weightGrams });
  }
  if (!variants.length) return { value: {}, error: "Tick at least one combination you sell" };
  return { value: { options, variants }, error: null };
}

