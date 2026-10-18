import { eq } from "drizzle-orm";
import { db } from "./client";
import { categories, settings } from "./schema";
import { slugify } from "../lib/slug";

const GOODS = ["Phones & Tech", "Fashion", "Shoes", "Beauty", "Home & Kitchen", "Groceries", "Services"];
const FOOD = ["Local dishes", "Fast food", "Drinks", "Pastries & desserts"];

/**
 * Adds the starter categories once, the very first time the server starts.
 * After that the admin is in charge — deleting them all won't bring them back.
 */
export async function seedOnce() {
  const [done] = await db.select().from(settings).where(eq(settings.key, "seeded.categories")).limit(1);
  if (done) return;
  await db.transaction(async (tx) => {
    const rows = [
      ...GOODS.map((name, i) => ({ kind: "goods" as const, name, slug: slugify(name), sortOrder: i })),
      ...FOOD.map((name, i) => ({ kind: "food" as const, name, slug: slugify(name), sortOrder: i })),
    ];
    await tx.insert(categories).values(rows).onConflictDoNothing();
    await tx.insert(settings).values({ key: "seeded.categories", value: true }).onConflictDoNothing();
  });
}
