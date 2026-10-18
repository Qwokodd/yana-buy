import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { RIDER_NEEDS_LICENSE } from "@yanabuy/shared";
import { db } from "../db/client";
import { riderApplications, shops } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { myRiderApplication } from "../lib/riders";
import { optionalText, phone, privateKey, requiredText } from "../lib/validation";
import { requireAuth, requireEmail } from "../middleware/auth";
import { notifyAdmins } from "../lib/notify";

/** Applying to deliver for YanaBuy. Mounted at /api/rider-application. */
export const riderApplicationRouter = Router();
riderApplicationRouter.use(requireAuth);

const optionalKey = z
  .string()
  .nullish()
  .transform((v) => v || null);

const applicationSchema = z
  .object({
    vehicle: z.enum(["motorbike", "keke", "car", "bicycle", "on_foot"], { errorMap: () => ({ message: "Choose how you'll deliver" }) }),
    plateNumber: optionalText(20, "Plate number"),
    city: requiredText(2, 60, "City"),
    areas: requiredText(3, 300, "Areas you can cover"),
    idType: z.enum(["national_id", "passport", "drivers_license", "voter_card"], { errorMap: () => ({ message: "Choose the type of ID" }) }),
    idFrontKey: privateKey("a photo of the front of your ID"),
    idBackKey: optionalKey,
    selfieKey: privateKey("a selfie"),
    licenseKey: optionalKey,
    emergencyName: requiredText(2, 80, "Emergency contact name"),
    emergencyPhone: phone,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.idType !== "passport" && !v.idBackKey) {
      ctx.addIssue({ code: "custom", path: ["idBackKey"], message: "Upload a photo of the back of your ID" });
    }
    if (v.idBackKey && !privateKey("").safeParse(v.idBackKey).success) {
      ctx.addIssue({ code: "custom", path: ["idBackKey"], message: "Upload the back of your ID again" });
    }
    const motor = RIDER_NEEDS_LICENSE.includes(v.vehicle);
    if (motor && !v.licenseKey) ctx.addIssue({ code: "custom", path: ["licenseKey"], message: "Upload a photo of your driver's licence" });
    if (v.licenseKey && !privateKey("").safeParse(v.licenseKey).success) {
      ctx.addIssue({ code: "custom", path: ["licenseKey"], message: "Upload your licence again" });
    }
    if (motor && !v.plateNumber) ctx.addIssue({ code: "custom", path: ["plateNumber"], message: "Enter the plate number" });
  });

async function mine(userId: string) {
  const [a] = await db.select().from(riderApplications).where(eq(riderApplications.userId, userId)).limit(1);
  return a ?? null;
}

riderApplicationRouter.get("/", async (req, res) => {
  const a = await mine(req.user!.id);
  res.json({ application: a ? myRiderApplication(req, a) : null });
});

/** Send (or re-send after changes were asked for) a rider application. */
riderApplicationRouter.post("/", requireEmail, async (req, res) => {
  const user = req.user!;
  const existing = await mine(user.id);
  if (existing?.status === "approved" || user.role === "rider") throw new HttpError(400, "You're already a YanaBuy rider.");
  if (existing?.status === "suspended") {
    throw new HttpError(403, `Your rider account is suspended${existing.statusReason ? `: ${existing.statusReason}` : ""}. Contact YanaBuy support.`);
  }
  if (user.role !== "buyer") throw new HttpError(403, "Seller and admin accounts can't become riders. Use a separate account to deliver.");
  const [shop] = await db.select({ id: shops.id }).from(shops).where(eq(shops.ownerId, user.id)).limit(1);
  if (shop) throw new HttpError(403, "This account has a shop application. Use a separate account to deliver.");

  const input = parse(applicationSchema, req.body);
  const values = {
    ...input,
    // Only motor vehicles have plates and licences.
    plateNumber: input.vehicle === "bicycle" || input.vehicle === "on_foot" ? null : input.plateNumber,
    licenseKey: input.vehicle === "bicycle" || input.vehicle === "on_foot" ? null : input.licenseKey,
    status: "pending" as const,
    statusReason: null,
    submittedAt: new Date(),
    reviewedAt: null,
    reviewedById: null,
    updatedAt: new Date(),
  };
  const [a] = existing
    ? await db.update(riderApplications).set(values).where(eq(riderApplications.id, existing.id)).returning()
    : await db.insert(riderApplications).values({ ...values, userId: user.id }).returning();
  notifyAdmins({ title: `New rider to approve: ${user.fullName}`, body: a.city ?? null, path: "/riders" });
  res.status(existing ? 200 : 201).json({ application: myRiderApplication(req, a) });
});
