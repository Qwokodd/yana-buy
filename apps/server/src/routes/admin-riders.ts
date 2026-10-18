import { Router, type Request } from "express";
import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/client";
import { orders, riderApplications, users, type RiderApplicationRow } from "../db/schema";
import { HttpError, parse } from "../lib/http";
import { audit } from "../lib/audit";
import { adminRiderApplication } from "../lib/riders";

/** Rider applications: review, approve, send back, suspend. Mounted under /api/admin. */
export const adminRidersRouter = Router();

const reviewer = alias(users, "rider_reviewer");

async function load(req: Request, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "Application not found");
  const [row] = await db
    .select({ a: riderApplications, u: users, r: { id: reviewer.id, fullName: reviewer.fullName } })
    .from(riderApplications)
    .innerJoin(users, eq(users.id, riderApplications.userId))
    .leftJoin(reviewer, eq(reviewer.id, riderApplications.reviewedById))
    .where(eq(riderApplications.id, id))
    .limit(1);
  if (!row) throw new HttpError(404, "Application not found");
  return row;
}

adminRidersRouter.get("/rider-applications", async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(["pending", "approved", "rejected", "suspended", "all"]).default("pending") }), req.query);
  const rows = await db
    .select({ a: riderApplications, u: users, r: { id: reviewer.id, fullName: reviewer.fullName } })
    .from(riderApplications)
    .innerJoin(users, eq(users.id, riderApplications.userId))
    .leftJoin(reviewer, eq(reviewer.id, riderApplications.reviewedById))
    .where(status === "all" ? undefined : eq(riderApplications.status, status))
    .orderBy(status === "pending" ? asc(riderApplications.submittedAt) : desc(riderApplications.submittedAt))
    .limit(200);
  res.json({ items: rows.map((x) => adminRiderApplication(req, x.a, x.u, x.r?.id ? { id: x.r.id, fullName: x.r.fullName ?? "" } : null)) });
});

adminRidersRouter.get("/rider-applications/:id", async (req, res) => {
  const x = await load(req, String(req.params.id));
  res.json({ application: adminRiderApplication(req, x.a, x.u, x.r?.id ? { id: x.r.id, fullName: x.r.fullName ?? "" } : null) });
});

const reasonSchema = z.object({
  reason: z.string({ required_error: "Give a reason" }).trim().min(3, "Give a reason in a few words").max(300, "Keep the reason short"),
});

async function move(req: Request, from: RiderApplicationRow["status"][], to: RiderApplicationRow["status"], action: string, reason: string | null) {
  const x = await load(req, String(req.params.id));
  if (!from.includes(x.a.status)) throw new HttpError(400, `This application is ${x.a.status} — that can't be done now. Reload to see the latest.`);
  if (to === "suspended") {
    const busy = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.riderId, x.u.id), inArray(orders.status, ["accepted", "ready", "picked_up"])))
      .limit(1);
    if (busy.length) throw new HttpError(409, "This rider still has deliveries. Give them to another rider first (Assign riders).");
  }
  const [a] = await db
    .update(riderApplications)
    .set({ status: to, statusReason: reason, reviewedAt: new Date(), reviewedById: req.user!.id, updatedAt: new Date() })
    .where(and(eq(riderApplications.id, x.a.id), eq(riderApplications.status, x.a.status)))
    .returning();
  if (!a) throw new HttpError(409, "The application changed — reload and try again");

  // Approving makes the account a rider; suspending turns it back into a buyer.
  let u = x.u;
  if (to === "approved" && u.role === "buyer") {
    [u] = await db.update(users).set({ role: "rider", updatedAt: new Date() }).where(eq(users.id, u.id)).returning();
  }
  if (to === "suspended" && u.role === "rider") {
    [u] = await db.update(users).set({ role: "buyer", updatedAt: new Date() }).where(eq(users.id, u.id)).returning();
  }
  await audit(req.user!.id, action, { type: "rider_application", id: a.id }, { name: u.fullName, ...(reason ? { reason } : {}) });
  return adminRiderApplication(req, a, u, { id: req.user!.id, fullName: req.user!.fullName });
}

adminRidersRouter.post("/rider-applications/:id/approve", async (req, res) => {
  res.json({ application: await move(req, ["pending"], "approved", "rider.approve", null) });
});

adminRidersRouter.post("/rider-applications/:id/reject", async (req, res) => {
  const { reason } = parse(reasonSchema, req.body);
  res.json({ application: await move(req, ["pending"], "rejected", "rider.reject", reason) });
});

adminRidersRouter.post("/rider-applications/:id/suspend", async (req, res) => {
  const { reason } = parse(reasonSchema, req.body);
  res.json({ application: await move(req, ["approved"], "suspended", "rider.suspend", reason) });
});

adminRidersRouter.post("/rider-applications/:id/reinstate", async (req, res) => {
  res.json({ application: await move(req, ["suspended"], "approved", "rider.reinstate", null) });
});
