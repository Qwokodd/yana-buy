import { Router } from "express";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { discountCodes } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { audit } from "../lib/audit";
import { discountOut, discountTotals, normalizeCode } from "../lib/discounts";
import { optionalText } from "../lib/validation";

/** Discount codes (YanaBuy pays the money off). Mounted under /api/admin. */
export const adminDiscountsRouter = Router();

const cents = z.number().int().min(1).max(100_000_000);
const when = z
  .string()
  .datetime({ offset: true, message: "Pick a valid date" })
  .nullish()
  .transform((v) => (v ? new Date(v) : null));

const fields = {
  code: z
    .string({ required_error: "Enter the code" })
    .transform(normalizeCode)
    .pipe(z.string().regex(/^[A-Z0-9$_-]{3,30}$/, "Use 3–30 letters or numbers, no spaces")),
  description: optionalText(200, "Description"),
  type: z.enum(["percent", "fixed"], { errorMap: () => ({ message: "Choose percent or a fixed amount" }) }),
  value: z.number({ required_error: "Enter how much it takes off" }).int().min(1, "Must take something off"),
  maxDiscount: cents.nullish().transform((v) => v ?? null),
  minSubtotal: cents.nullish().transform((v) => v ?? null),
  mode: z.enum(["all", "goods", "food"]).default("all"),
  startsAt: when,
  endsAt: when,
  usageLimit: z.number().int().min(1).max(1_000_000).nullish().transform((v) => v ?? null),
  perBuyerLimit: z.number().int().min(1).max(1000).nullish().transform((v) => v ?? null),
  active: z.boolean().default(true),
};

const check = (v: { type?: "percent" | "fixed"; value?: number; startsAt?: Date | null; endsAt?: Date | null }) => {
  if (v.type === "percent" && v.value !== undefined && v.value > 100) throw new HttpError(400, "A percent can't be more than 100", { value: "At most 100" });
  if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) throw new HttpError(400, "The end date must be after the start date", { endsAt: "After the start" });
};

adminDiscountsRouter.get("/discounts", async (_req, res) => {
  const [rows, totals] = await Promise.all([db.select().from(discountCodes).orderBy(desc(discountCodes.createdAt)), discountTotals()]);
  const byId = new Map(totals.map((t) => [t.codeId, t.total]));
  res.json({ items: rows.map((r) => discountOut(r, byId.get(r.id) ?? 0)) });
});

adminDiscountsRouter.post("/discounts", async (req, res) => {
  const input = parse(z.object(fields).strict(), req.body);
  check(input);
  const [taken] = await db.select({ id: discountCodes.id }).from(discountCodes).where(eq(discountCodes.code, input.code)).limit(1);
  if (taken) throw new HttpError(409, "That code already exists", { code: "Already used" });
  const [row] = await db.insert(discountCodes).values({ ...input, createdById: req.user!.id }).returning();
  await audit(req.user!.id, "discount.created", { type: "discount", id: row.id }, { code: row.code, type: row.type, value: row.value });
  res.status(201).json({ discount: discountOut(row) });
});

adminDiscountsRouter.patch("/discounts/:id", async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) throw new HttpError(404, "Code not found");
  const input = parse(z.object(fields).partial().strict(), req.body);
  const [current] = await db.select().from(discountCodes).where(eq(discountCodes.id, req.params.id)).limit(1);
  if (!current) throw new HttpError(404, "Code not found");
  check({ ...current, ...input });
  if (input.code && input.code !== current.code) {
    if (current.timesUsed > 0) throw new HttpError(409, "This code has been used, so its name can't change. Make a new code instead.", { code: "Already used by buyers" });
    const [taken] = await db.select({ id: discountCodes.id }).from(discountCodes).where(eq(discountCodes.code, input.code)).limit(1);
    if (taken) throw new HttpError(409, "That code already exists", { code: "Already used" });
  }
  const [row] = await db.update(discountCodes).set({ ...input, updatedAt: new Date() }).where(eq(discountCodes.id, current.id)).returning();
  await audit(req.user!.id, "discount.updated", { type: "discount", id: row.id }, { code: row.code, changes: Object.keys(input) });
  const totals = await discountTotals();
  res.json({ discount: discountOut(row, totals.find((t) => t.codeId === row.id)?.total ?? 0) });
});

adminDiscountsRouter.delete("/discounts/:id", async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) throw new HttpError(404, "Code not found");
  const [current] = await db.select().from(discountCodes).where(eq(discountCodes.id, req.params.id)).limit(1);
  if (!current) throw new HttpError(404, "Code not found");
  if (current.timesUsed > 0) throw new HttpError(409, "This code has been used, so it's kept for the records. Switch it off instead.");
  await db.delete(discountCodes).where(eq(discountCodes.id, current.id));
  await audit(req.user!.id, "discount.deleted", { type: "discount", id: current.id }, { code: current.code });
  res.status(204).end();
});
