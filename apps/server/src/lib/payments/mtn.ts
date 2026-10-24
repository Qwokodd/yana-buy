import { env } from "../../env";

/**
 * MTN Mobile Money — Collections API ("Request to Pay").
 * The buyer gets a prompt on their phone and approves it with their PIN;
 * we then ask MTN for the result.
 * Docs: https://momodeveloper.mtn.com/api-documentation
 */

export const mtnConfigured = () => !!(env.MTN_MOMO_SUBSCRIPTION_KEY && env.MTN_MOMO_API_USER && env.MTN_MOMO_API_KEY);

const base = () => env.MTN_MOMO_BASE_URL.replace(/\/$/, "");
let token: { value: string; expires: number } | null = null;

async function accessToken() {
  if (token && token.expires > Date.now() + 30_000) return token.value;
  const res = await fetch(`${base()}/collection/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.MTN_MOMO_API_USER}:${env.MTN_MOMO_API_KEY}`).toString("base64")}`,
      "Ocp-Apim-Subscription-Key": env.MTN_MOMO_SUBSCRIPTION_KEY!,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`MTN token failed (${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return token.value;
}

const headers = async (extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${await accessToken()}`,
  "X-Target-Environment": env.MTN_MOMO_TARGET_ENV,
  "Ocp-Apim-Subscription-Key": env.MTN_MOMO_SUBSCRIPTION_KEY!,
  ...extra,
});

/** "+231770000000" → "231770000000" (MTN wants digits only). */
const msisdn = (phone: string) => phone.replace(/\D/g, "");

/** Cents → the amount string MTN expects ("1550" or "15.50"). */
const amountText = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

export async function requestToPay(p: { reference: string; cents: number; phone: string; externalId: string; message: string }) {
  const res = await fetch(`${base()}/collection/v1_0/requesttopay`, {
    method: "POST",
    headers: await headers({ "X-Reference-Id": p.reference, "Content-Type": "application/json", ...(env.MTN_MOMO_CALLBACK_URL ? { "X-Callback-Url": env.MTN_MOMO_CALLBACK_URL } : {}) }),
    body: JSON.stringify({
      amount: amountText(p.cents),
      currency: env.MTN_MOMO_CURRENCY,
      externalId: p.externalId,
      payer: { partyIdType: "MSISDN", partyId: msisdn(p.phone) },
      payerMessage: p.message.slice(0, 160),
      payeeNote: p.message.slice(0, 160),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  // 202 Accepted = the prompt is on its way to the buyer's phone.
  if (res.status !== 202) {
    const text = await res.text().catch(() => "");
    throw new Error(`MTN didn't accept the payment request (${res.status}) ${text.slice(0, 200)}`);
  }
}

export type MtnStatus = { status: "PENDING" | "SUCCESSFUL" | "FAILED"; reason: string | null; transactionId: string | null };

export async function paymentStatus(reference: string): Promise<MtnStatus> {
  const res = await fetch(`${base()}/collection/v1_0/requesttopay/${reference}`, {
    headers: await headers(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`MTN status check failed (${res.status})`);
  const data = (await res.json()) as { status: string; reason?: string | { code?: string; message?: string }; financialTransactionId?: string };
  const status = data.status === "SUCCESSFUL" ? "SUCCESSFUL" : data.status === "FAILED" || data.status === "REJECTED" || data.status === "TIMEOUT" ? "FAILED" : "PENDING";
  const reason = typeof data.reason === "string" ? data.reason : (data.reason?.message ?? data.reason?.code ?? null);
  return { status, reason, transactionId: data.financialTransactionId ?? null };
}
