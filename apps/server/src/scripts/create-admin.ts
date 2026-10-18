/**
 * Creates the first admin account, or turns an existing account into an admin.
 *
 *   npm run create-admin -- --phone 0770000001 --password "your password" --name "YanaBuy Admin"
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { normalizeLiberianPhone } from "@yanabuy/shared";
import { db, pool } from "../db/client";
import { users } from "../db/schema";
import { runMigrations } from "../db/migrate";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const phone = normalizeLiberianPhone(arg("phone") ?? "");
  const password = arg("password");
  const name = arg("name") ?? "YanaBuy Admin";
  if (!phone) throw new Error('Give a phone number, e.g.  --phone 0770000001');

  await runMigrations();
  const [existing] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        role: "admin",
        status: "active",
        blockedReason: null,
        blockedAt: null,
        ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
    console.log(`✅ ${existing.fullName} (${phone}) is now an admin${password ? " with the new password" : ""}.`);
  } else {
    if (!password || password.length < 8) throw new Error("Give a password of at least 8 characters:  --password \"...\"");
    await db.insert(users).values({ fullName: name, phone, passwordHash: await bcrypt.hash(password, 12), role: "admin" });
    console.log(`✅ Admin account created: ${name} (${phone}). Log in at http://localhost:3001`);
  }
}

main()
  .catch((err) => {
    console.error(`❌ ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
