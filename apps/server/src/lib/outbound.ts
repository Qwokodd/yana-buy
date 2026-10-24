import fs from "node:fs";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../env";
import { getBranding } from "./branding";

/**
 * Email (SMTP) and text messages (Twilio). Both are optional: with no keys in
 * .env nothing is sent (sign-up codes are printed in the server window instead).
 * OUTBOX_FILE (tests) writes every message to a file instead of sending it.
 */

export const emailReady = () => !!env.SMTP_HOST || !!env.OUTBOX_FILE;
export const smsReady = () => (!!env.TWILIO_ACCOUNT_SID && !!env.TWILIO_AUTH_TOKEN && !!(env.TWILIO_FROM || env.TWILIO_MESSAGING_SERVICE_SID)) || !!env.OUTBOX_FILE;

function toOutbox(entry: Record<string, unknown>) {
  fs.appendFileSync(env.OUTBOX_FILE!, JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n");
}

let transporter: Transporter | null = null;
function mailer() {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A full link to a page on the website (notification links are stored as paths like /orders/123). */
export const webLink = (path?: string | null) => (path ? `${env.WEB_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}` : env.WEB_URL);

/** A simple branded email: heading, a few lines, and an optional button. */
export async function emailHtml(o: { heading: string; lines: string[]; button?: { label: string; url: string }; big?: string }) {
  const b = await getBranding();
  const purple = b.colors.primary;
  return `<!doctype html><html><body style="margin:0;background:#F6F2F8;font-family:Arial,Helvetica,sans-serif;color:#2B1F38">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:${purple};padding:18px 24px;color:#fff;font-size:20px;font-weight:bold">${esc(b.appName)}</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 12px;font-size:20px">${esc(o.heading)}</h1>
${o.big ? `<p style="margin:16px 0;font-size:34px;letter-spacing:8px;font-weight:bold;color:${purple}">${esc(o.big)}</p>` : ""}
${o.lines.map((l) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.5">${esc(l)}</p>`).join("")}
${o.button ? `<p style="margin:20px 0 4px"><a href="${esc(o.button.url)}" style="display:inline-block;background:${purple};color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">${esc(o.button.label)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:14px 24px;background:#FBF9FC;font-size:12px;color:#6B6275">You get this because you have a ${esc(b.appName)} account.</td></tr>
</table></td></tr></table></body></html>`;
}

/** Sends one email. Returns false (never throws) if email is off or the send failed. */
export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (env.OUTBOX_FILE) {
    toOutbox({ channel: "email", to, subject, text });
    return true;
  }
  if (!env.SMTP_HOST) return false;
  try {
    await mailer().sendMail({ from: env.MAIL_FROM, to, subject, html, text });
    return true;
  } catch (err) {
    console.error(`email to ${to} failed:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/** Plain characters every phone network handles (GSM-7): fancy dashes, quotes and dots become simple ones. */
const GSM = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\\[~\]|€]*$/;
export function smsText(body: string) {
  let t = body
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[\u2022\u00B7]/g, "*")
    .replace(/\u00A0/g, " ");
  if (!GSM.test(t)) t = [...t].map((c) => (GSM.test(c) ? c : "?")).join("");
  return t;
}
/**
 * One SMS is 160 plain characters. Liberian networks don't join longer messages
 * together, so texts are kept to one part.
 */
export const SMS_MAX = 160;

/** Sends one text message through Twilio. Returns false (never throws) if SMS is off or the send failed. */
export async function sendSms(to: string, body: string): Promise<boolean> {
  const plain = smsText(body);
  const text = plain.length > SMS_MAX ? `${plain.slice(0, SMS_MAX - 3)}...` : plain;
  if (env.OUTBOX_FILE) {
    toOutbox({ channel: "sms", to, text });
    return true;
  }
  if (!smsReady()) return false;
  try {
    const form = new URLSearchParams({ To: to, Body: text });
    if (env.TWILIO_MESSAGING_SERVICE_SID) form.set("MessagingServiceSid", env.TWILIO_MESSAGING_SERVICE_SID);
    else form.set("From", env.TWILIO_FROM!);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      console.error(`SMS to ${to} failed: ${res.status} ${err.message ?? ""}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`SMS to ${to} failed:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/** Printed once at start-up so it's clear what's switched on. */
export function describeOutbound() {
  const parts = [emailReady() ? "✉️  Email on" : "✉️  Email off (no SMTP_HOST) — sign-up codes print here, email not required", smsReady() ? "💬 SMS on" : "💬 SMS off (no Twilio keys)"];
  return parts.join(" · ");
}
