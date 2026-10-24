/**
 * Sends one test text message with the Twilio keys in apps/server/.env.
 *
 *   npm run test-sms -- 0886000000        (Liberia)
 *   npm run test-sms -- "(215) 555 0123"  (USA)
 */
import { normalizePhone } from "@yanabuy/shared";
import { env } from "../env";
import { sendSms, smsReady } from "../lib/outbound";

const to = normalizePhone(process.argv[2] ?? "");
if (!to) {
  console.error('Give a phone number, e.g.  npm run test-sms -- 0886000000');
  process.exit(1);
}
if (!smsReady() || env.OUTBOX_FILE) {
  console.error("❌ SMS is off: fill in TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_MESSAGING_SERVICE_SID (or TWILIO_FROM) in apps/server/.env");
  process.exit(1);
}
console.log(`Sending a test text to ${to} via ${env.TWILIO_MESSAGING_SERVICE_SID ? `Messaging Service ${env.TWILIO_MESSAGING_SERVICE_SID.slice(0, 6)}…` : `sender ${env.TWILIO_FROM}`}`);
const ok = await sendSms(to, "YanaBuy: this is a test message. Text messages are working.");
console.log(ok ? "✅ Twilio accepted it. Check the phone (it can take a minute). Twilio Console → Monitor → Logs → Messaging shows if it was delivered." : "❌ Twilio refused it — the reason is printed above.");
process.exit(ok ? 0 : 1);
