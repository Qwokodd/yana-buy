import { describeOutbound } from "./lib/outbound";
import { createServer } from "node:http";
import { env } from "./env";
import { createApp } from "./app";
import { runMigrations } from "./db/migrate";
import { pool } from "./db/client";
import { seedOnce } from "./db/seed";
import { startPaymentSweeper } from "./lib/payments";
import { mtnConfigured } from "./lib/payments/mtn";

async function main() {
  try {
    await runMigrations();
    await seedOnce();
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ECONNREFUSED" || code === "ENOTFOUND") {
      console.error("❌ Can't reach the database. Is Docker running? From the project folder run:  npm run db:up");
    } else {
      console.error("❌ Database update failed:", err);
    }
    process.exit(1);
  }

  startPaymentSweeper();
  const server = createServer(createApp());
  server.listen(env.PORT, "0.0.0.0", () => {
    console.log(`🚀 YanaBuy API v3 listening on http://localhost:${env.PORT}`);
    console.log(mtnConfigured() ? "💳 MTN Mobile Money is connected" : "💵 MTN Mobile Money not set up — cash on delivery only");
    console.log(describeOutbound());
  });

  const shutdown = () => {
    server.close();
    pool.end().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
