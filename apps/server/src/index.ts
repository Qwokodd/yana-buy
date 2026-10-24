import { describeOutbound } from "./lib/outbound";
import { createServer } from "node:http";
import { env } from "./env";
import { createApp } from "./app";
import { runMigrations } from "./db/migrate";
import { pool } from "./db/client";
import { seedOnce } from "./db/seed";
import { startPaymentSweeper } from "./lib/payments";
import { startTransferSweeper } from "./lib/payments/transfers";
import { disbursementConfigured } from "./lib/payments/mtn-disbursement";
import { mtnConfigured } from "./lib/payments/mtn";
import { getFinance } from "./lib/finance";
import { endFlashSales } from "./lib/products";

async function main() {
  try {
    await runMigrations();
    await seedOnce();
    // Commission rates, so buyer prices (seller price + commission) are right from the first request.
    await getFinance();
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
  startTransferSweeper();
  // Flash sales: put the old price back once a sale's time is up.
  setInterval(() => void endFlashSales().catch((err) => console.error("Ending flash sales failed:", err)), 60_000).unref();
  void endFlashSales().catch(() => {});
  const server = createServer(createApp());
  server.listen(env.PORT, "0.0.0.0", () => {
    console.log(`🚀 YanaBuy API v3 listening on http://localhost:${env.PORT}`);
    console.log(mtnConfigured() ? "💳 MTN Mobile Money is connected" : "💵 MTN Mobile Money not set up — cash on delivery only");
    console.log(disbursementConfigured() ? "💸 MTN MoMo payouts (Send by MoMo) are connected" : "💸 MTN MoMo payouts not set up — pay shops and riders by hand");
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
