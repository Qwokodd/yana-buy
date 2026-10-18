import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

/**
 * Applies any migration files that haven't run yet, in order. It only ever
 * adds — it never drops or resets the database, so it is safe to run on
 * every server start.
 */
export async function runMigrations() {
  await migrate(db, { migrationsFolder });
}

// `npm run db:migrate`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log("✅ Database is up to date");
      return pool.end();
    })
    .catch((err) => {
      console.error("❌ Migration failed:", err);
      process.exit(1);
    });
}
