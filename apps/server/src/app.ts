import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./env";
import { errorHandler } from "./lib/http";
import { authRouter } from "./routes/auth";
import { meRouter } from "./routes/me";
import { privateFilesRouter, uploadRouter, UPLOAD_ROOT } from "./routes/uploads";
import { shopRouter } from "./routes/shop";
import { shopProductsRouter } from "./routes/shop-products";
import { shopOrdersRouter } from "./routes/shop-orders";
import { shopWalletRouter } from "./routes/shop-wallet";
import { ordersRouter, quoteRouter } from "./routes/orders";
import { riderRouter } from "./routes/rider";
import { publicRouter } from "./routes/public";
import { adminRouter } from "./routes/admin";
import { paymentCallbacksRouter } from "./routes/payment-callbacks";
import { reviewsRouter, shopReviewsRouter } from "./routes/reviews";
import { chatsRouter } from "./routes/chats";
import { sourcingRouter } from "./routes/sourcing";
import { bookingsRouter, shopBookingsRouter } from "./routes/bookings";
import { riderApplicationRouter } from "./routes/rider-application";
import { shopProfileRouter } from "./routes/shop-profile";
import { mediaLinks } from "./lib/media-links";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());

  const origins = env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
  app.use(
    cors({
      // The Expo app on a phone sends no Origin header, so requests without one are allowed.
      origin: (origin, cb) => cb(null, !origin || origins.includes(origin) || env.NODE_ENV !== "production"),
    })
  );
  app.use(express.json({ limit: "1mb" }));
  // Photo links point at the address the app is using (phones can't use "localhost").
  app.use(mediaLinks);

  app.get("/health", (_req, res) => res.json({ status: "ok", version: "3" }));

  // Uploaded photos — allowed to show on the web, admin and phone apps.
  app.use(
    "/uploads",
    (_req, res, next) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(UPLOAD_ROOT, { index: false, maxAge: "7d" })
  );

  app.use("/private-files", privateFilesRouter);

  app.use("/api/public", publicRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/me", meRouter);
  app.use("/api/uploads", uploadRouter);
  app.use("/api/shop/products", shopProductsRouter);
  app.use("/api/shop/orders", shopOrdersRouter);
  app.use("/api/shop/wallet", shopWalletRouter);
  app.use("/api/shop/reviews", shopReviewsRouter);
  app.use("/api/reviews", reviewsRouter);
  app.use("/api/chats", chatsRouter);
  app.use("/api/sourcing", sourcingRouter);
  app.use("/api/rider-application", riderApplicationRouter);
  app.use("/api/cart/quote", quoteRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/bookings", bookingsRouter);
  app.use("/api/shop/bookings", shopBookingsRouter);
  app.use("/api/rider", riderRouter);
  app.use("/api/shop", shopProfileRouter);
  app.use("/api/shop", shopRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/payments", paymentCallbacksRouter);

  app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.path}` }));
  app.use(errorHandler);
  return app;
}
