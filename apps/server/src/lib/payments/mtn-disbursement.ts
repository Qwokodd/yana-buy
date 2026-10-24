import { env } from "../../env";

/**
 * MTN Mobile Money — Disbursements API ("Transfer").
 * Sends money from YanaBuy's MTN wallet to a shop's or rider's MTN number.
 * Uses its own subscription key, API user and API key (separate from Collections),
 * but the same base URL, target environment and currency.
 * Docs: https://momodeveloper.mtn.com/api-documentation
 */

export const disbursementConfigured = () => !!(env.MTN_DISB_SUBSCRIPTION_KEY && env.MTN_DISB_API_USER && env.MTN_DISB_API_KEY);

const base = () => env.MTN_MOMO_BASE_URL.replace(/\/$/, "");
let token: { value: string; expires: number } | null = null;

async function accessToken() {
  if (token && token.expires > Date.now() + 30_000) return token.value;
  const res = await fetch(`${base()}/disbursement/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.MTN_DISB_API_USER}:${env.MTN_DISB_API_KEY}`).toString("base64")}`,
      "Ocp-Apim-Subscription-Key": env.MTN_DISB_SUBSCRIPTION_KEY!,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`MTN disbursement token failed (${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return token.value;
}

const headers = async (extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${await accessToken()}`,
  "X-Target-Environment": env.MTN_MOMO_TARGET_ENV,
  "Ocp-Apim-Subscription-Key": env.MTN_DISB_SUBSCRIPTION_KEY!,
  ...extra,
});

const msisdn = (phone: string) => phone.replace(/\D/g, "");
const amountText = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

/**
 * Asks MTN to send money.
 * "accepted"  = MTN took it (202) — check the status for the result.
 * "rejected"  = MTN answered and said no — nothing was sent.
 * "unknown"   = no clear answer (timeout / network) — it MAY have gone; check the status before doing anything.
 */
export async function transfer(p: { reference: string; cents: number; phone: string; externalId: string; note: string }): Promise<{ result: "accepted" | "rejected" | "unknown"; detail: string }> {
  let res: Response;
  try {
    res = await fetch(`${base()}/disbursement/v1_0/transfer`, {
      method: "POST",
      headers: await headers({ "X-Reference-Id": p.reference, "Content-Type": "application/json", ...(env.MTN_MOMO_CALLBACK_URL ? { "X-Callback-Url": env.MTN_MOMO_CALLBACK_URL } : {}) }),
      body: JSON.stringify({
        amount: amountText(p.cents),
        currency: env.MTN_MOMO_CURRENCY,
        externalId: p.externalId,
        payee: { partyIdType: "MSISDN", partyId: msisdn(p.phone) },
        payerMessage: p.note.slice(0, 160),
        payeeNote: p.note.slice(0, 160),
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    return { result: "unknown", detail: String((err as Error).message ?? err) };
  }
  if (res.status === 202) return { result: "accepted", detail: "" };
  const text = await res.text().catch(() => "");
  // 5xx can mean MTN got it but failed to answer — treat as unknown and check the status.
  return { result: res.status >= 500 ? "unknown" : "rejected", detail: `(${res.status}) ${text.slice(0, 200)}` };
}

export type TransferStatus = { status: "PENDING" | "SUCCESSFUL" | "FAILED" | "NOT_FOUND"; reason: string | null; transactionId: string | null };

export async function transferStatus(reference: string): Promise<TransferStatus> {
  const res = await fetch(`${base()}/disbursement/v1_0/transfer/${reference}`, { headers: await headers(), signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) return { status: "NOT_FOUND", reason: "MTN has no record of this transfer", transactionId: null };
  if (!res.ok) throw new Error(`MTN transfer status check failed (${res.status})`);
  const data = (await res.json()) as { status: string; reason?: string | { code?: string; message?: string }; financialTransactionId?: string };
  const status = data.status === "SUCCESSFUL" ? "SUCCESSFUL" : data.status === "FAILED" || data.status === "REJECTED" || data.status === "TIMEOUT" ? "FAILED" : "PENDING";
  const reason = typeof data.reason === "string" ? data.reason : (data.reason?.message ?? data.reason?.code ?? null);
  return { status, reason, transactionId: data.financialTransactionId ?? null };
}
