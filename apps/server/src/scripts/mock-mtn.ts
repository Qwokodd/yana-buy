/**
 * A pretend MTN MoMo server for testing without real money.
 *   npx tsx src/scripts/mock-mtn.ts          (listens on port 4555)
 * Then start the API with MTN_MOMO_BASE_URL=http://localhost:4555 and any
 * MTN_MOMO_SUBSCRIPTION_KEY / MTN_MOMO_API_USER / MTN_MOMO_API_KEY.
 * Payer numbers ending in 1 approve, ending in 2 decline, anything else stays waiting.
 */
import { createServer } from "node:http";

const requests = new Map<string, { payer: string; amount: string; currency: string }>();

createServer((req, res) => {
  const send = (status: number, body?: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };
  if (!req.headers["ocp-apim-subscription-key"]) return send(401, { message: "missing subscription key" });

  if (req.method === "POST" && req.url === "/collection/token/") {
    if (!req.headers.authorization?.startsWith("Basic ")) return send(401, {});
    return send(200, { access_token: "mock-token", token_type: "access_token", expires_in: 3600 });
  }
  if (!req.headers.authorization?.startsWith("Bearer ") || !req.headers["x-target-environment"]) return send(401, {});

  if (req.method === "POST" && req.url === "/collection/v1_0/requesttopay") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const ref = String(req.headers["x-reference-id"] ?? "");
      const body = JSON.parse(raw || "{}");
      if (!ref || !body.payer?.partyId || !body.amount) return send(400, { message: "bad request" });
      if (body.payer.partyId.endsWith("9")) return send(500, { message: "service unavailable" });
      requests.set(ref, { payer: body.payer.partyId, amount: body.amount, currency: body.currency });
      send(202);
    });
    return;
  }
  const m = req.url?.match(/^\/collection\/v1_0\/requesttopay\/(.+)$/);
  if (req.method === "GET" && m) {
    const r = requests.get(m[1]);
    if (!r) return send(404, { message: "not found" });
    const last = r.payer.slice(-1);
    const status = last === "1" ? "SUCCESSFUL" : last === "2" ? "FAILED" : "PENDING";
    return send(200, {
      amount: r.amount,
      currency: r.currency,
      financialTransactionId: status === "SUCCESSFUL" ? `MTN${Date.now()}` : undefined,
      status,
      reason: status === "FAILED" ? "APPROVAL_REJECTED" : undefined,
    });
  }
  send(404, {});
}).listen(4555, () => console.log("Mock MTN MoMo on http://localhost:4555"));
