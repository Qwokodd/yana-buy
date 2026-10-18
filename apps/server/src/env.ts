import "dotenv/config";
import { z } from "zod";

const DEV_ACCESS = "dev-only-access-secret-change-me-before-going-live-000";
const DEV_REFRESH = "dev-only-refresh-secret-change-me-before-going-live-00";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default("postgresql://yanabuy:yanabuy_dev_password@localhost:5433/yanabuy"),
  JWT_ACCESS_SECRET: z.string().min(32).default(DEV_ACCESS),
  JWT_REFRESH_SECRET: z.string().min(32).default(DEV_REFRESH),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:3001,http://localhost:8081"),
  PUBLIC_URL: z.string().optional(),
  UPLOAD_DIR: z.string().default("uploads"),
  // ID documents and selfies. Never served publicly — only through signed links.
  PRIVATE_UPLOAD_DIR: z.string().default("private-uploads"),

  // MTN Mobile Money (Collections). Leave empty until MTN gives you production keys.
  MTN_MOMO_BASE_URL: z.string().default("https://sandbox.momodeveloper.mtn.com"),
  MTN_MOMO_SUBSCRIPTION_KEY: z.string().optional(),
  MTN_MOMO_API_USER: z.string().optional(),
  MTN_MOMO_API_KEY: z.string().optional(),
  /** "sandbox" while testing; MTN tells you the live value (e.g. "mtnliberia"). */
  MTN_MOMO_TARGET_ENV: z.string().default("sandbox"),
  /** Sandbox only accepts EUR; live Liberia is LRD. */
  MTN_MOMO_CURRENCY: z.string().default("USD"),

  /** The website's address, for links in emails and texts (e.g. https://yanabuy.com). */
  WEB_URL: z.string().default("http://localhost:3000"),
  /** The admin dashboard's address, for links in emails and texts to admins. */
  ADMIN_URL: z.string().default("http://localhost:3001"),

  // Email through any SMTP service (Gmail, Zoho, Brevo, Mailgun…). Leave SMTP_HOST empty to switch email off.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  /** "true" for port 465. */
  SMTP_SECURE: z.string().optional().transform((v) => v === "true" || v === "1"),
  /** Who emails come from, e.g.  YanaBuy <hello@yanabuy.com> */
  MAIL_FROM: z.string().default("YanaBuy <no-reply@yanabuy.com>"),

  // Text messages through Twilio. Leave TWILIO_ACCOUNT_SID empty to switch SMS off.
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  /** A Twilio number (+1…) or an approved sender name. Or use TWILIO_MESSAGING_SERVICE_SID instead. */
  TWILIO_FROM: z.string().optional(),
  TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),

  /** Testing only: write emails and texts to this file instead of sending them. */
  OUTBOX_FILE: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid settings in apps/server/.env:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";

if (isProd && (env.JWT_ACCESS_SECRET === DEV_ACCESS || env.JWT_REFRESH_SECRET === DEV_REFRESH)) {
  console.error("❌ Set real JWT_ACCESS_SECRET and JWT_REFRESH_SECRET before running in production.");
  process.exit(1);
}
