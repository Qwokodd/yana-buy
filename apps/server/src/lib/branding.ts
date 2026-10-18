import { eq } from "drizzle-orm";
import { DEFAULT_BRANDING, type Branding } from "@yanabuy/shared";
import { db } from "../db/client";
import { settings } from "../db/schema";

const KEY = "branding";

export async function getBranding(): Promise<Branding> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
  if (!row) return DEFAULT_BRANDING;
  const saved = row.value as Partial<Branding>;
  return {
    ...DEFAULT_BRANDING,
    ...saved,
    colors: { ...DEFAULT_BRANDING.colors, ...(saved.colors ?? {}) },
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function saveBranding(value: Omit<Branding, "updatedAt">, adminId: string) {
  const now = new Date();
  await db
    .insert(settings)
    .values({ key: KEY, value, updatedAt: now, updatedById: adminId })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now, updatedById: adminId } });
  return getBranding();
}
