import { randomUUID } from "node:crypto";
import { z } from "zod";
import { variantLabel, type ProductOption, type ProductVariant } from "@yanabuy/shared";
import { HttpError } from "./http";
import { imageUrl } from "./validation";

/** Colour / size / MOQ choices on a product, and the variants (combinations) that carry price and stock. */

export const MAX_OPTIONS = 3;
export const MAX_VALUES = 30;
export const MAX_VARIANTS = 100;
const MAX_PRICE = 1_000_000_000;

const label = z
  .string()
  .trim()
  .min(1, "Give every choice a name")
  .max(40, "Keep option names short");

export const optionsSchema = z
  .array(
    z.object({
      name: label,
      values: z
        .array(z.string().trim().min(1, "Choices can't be empty").max(60, "Keep choices short"))
        .min(1, "Add at least one choice to each option")
        .max(MAX_VALUES, `Up to ${MAX_VALUES} choices per option`),
    })
  )
  .max(MAX_OPTIONS, `Up to ${MAX_OPTIONS} options (e.g. Colour, Size)`);

const cents = (what: string) =>
  z
    .number({ invalid_type_error: `Enter the ${what}`, required_error: `Enter the ${what}` })
    .int(`${what} must be in whole cents`)
    .max(MAX_PRICE, `${what} is too high`);

export const variantsSchema = z
  .array(
    z.object({
      id: z.string().max(64).optional(),
      values: z.array(z.string().trim().min(1).max(60)).min(1).max(MAX_OPTIONS),
      price: cents("price").min(1, "Every choice needs a price above zero"),
      compareAtPrice: cents("old price").min(1).nullish().transform((v) => v ?? null),
      stock: z.number().int("Stock must be a whole number").min(0, "Stock can't be below zero").max(100_000).nullish().transform((v) => v ?? null),
      image: imageUrl.nullish().transform((v) => v ?? null),
      /** Weight of one, in grams (null = the product's weight). */
      weightGrams: z.number().int().min(1).max(1_000_000).nullish(),
    })
  )
  .max(MAX_VARIANTS, `Up to ${MAX_VARIANTS} combinations`);

const key = (values: string[]) => values.map((v) => v.toLowerCase()).join("\u0000");

/**
 * Checks options and variants fit together and gives each variant a stable id
 * (kept from the previous version when the combination is the same, so carts keep working).
 */
export function normalizeVariants(
  options: ProductOption[],
  variants: z.infer<typeof variantsSchema>,
  previous: ProductVariant[] = []
): { options: ProductOption[]; variants: ProductVariant[] } {
  if (!options.length) {
    if (variants.length) throw new HttpError(400, "Add the options (e.g. Colour) before their prices", { options: "Missing" });
    return { options: [], variants: [] };
  }
  const names = new Set<string>();
  for (const o of options) {
    if (names.has(o.name.toLowerCase())) throw new HttpError(400, `"${o.name}" is used twice`, { options: "Each option needs its own name" });
    names.add(o.name.toLowerCase());
    if (new Set(o.values.map((v) => v.toLowerCase())).size !== o.values.length) {
      throw new HttpError(400, `${o.name} has the same choice twice`, { options: "Remove the repeated choice" });
    }
  }
  if (!variants.length) throw new HttpError(400, "Give a price for at least one combination", { variants: "Missing" });

  const oldByKey = new Map(previous.map((v) => [key(v.values), v.id]));
  const oldIds = new Set(previous.map((v) => v.id));
  const seen = new Set<string>();
  const out: ProductVariant[] = variants.map((v) => {
    if (v.values.length !== options.length) throw new HttpError(400, "Every combination needs one choice for each option", { variants: "Incomplete" });
    v.values.forEach((value, i) => {
      if (!options[i].values.some((x) => x.toLowerCase() === value.toLowerCase())) {
        throw new HttpError(400, `"${value}" isn't one of the ${options[i].name} choices`, { variants: "Unknown choice" });
      }
    });
    const k = key(v.values);
    if (seen.has(k)) throw new HttpError(400, `${variantLabel(v.values)} is listed twice`, { variants: "Repeated" });
    seen.add(k);
    if (v.compareAtPrice !== null && v.compareAtPrice <= v.price) {
      throw new HttpError(400, `${variantLabel(v.values)}: the old price must be higher than the price`, { variants: "Old price too low" });
    }
    const id = (v.id && oldIds.has(v.id) && v.id) || oldByKey.get(k) || randomUUID().slice(0, 13);
    return { id, values: v.values, price: v.price, compareAtPrice: v.compareAtPrice, stock: v.stock, image: v.image, weightGrams: v.weightGrams ?? null };
  });
  return { options, variants: out };
}

/** What a product with variants shows on cards and in search: the cheapest choice, and total stock. */
export function summarize(variants: ProductVariant[]) {
  const cheapest = variants.reduce((a, b) => (b.price < a.price ? b : a));
  const counted = variants.every((v) => v.stock !== null);
  return {
    price: cheapest.price,
    compareAtPrice: cheapest.compareAtPrice,
    stock: counted ? variants.reduce((n, v) => n + (v.stock ?? 0), 0) : null,
  };
}
