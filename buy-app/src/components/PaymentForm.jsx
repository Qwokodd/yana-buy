import { useState } from "react";

const MOMO_NETWORKS = [
  { id: "mtn", label: "Lonestar MTN MoMo" },
  { id: "orange", label: "Orange Money" },
];

function luhnValid(num) {
  const digits = num.replace(/\D/g, "");
  if (digits.length < 13) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function formatCardNumber(value) {
  return value
    .replace(/\D/g, "")
    .slice(0, 19)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

export default function PaymentForm({ amountLabel, onSuccess, disabled }) {
  const [method, setMethod] = useState("visa");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  // card state
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");

  // momo state
  const [network, setNetwork] = useState("mtn");
  const [momoNumber, setMomoNumber] = useState("");

  function validateCard() {
    if (!cardName.trim()) return "Enter the name on the card.";
    if (!luhnValid(cardNumber)) return "Enter a valid 16-digit card number.";
    if (!/^\d{2}\/\d{2}$/.test(expiry)) return "Enter expiry as MM/YY.";
    const [mm, yy] = expiry.split("/").map(Number);
    if (mm < 1 || mm > 12) return "Enter a valid expiry month.";
    const now = new Date();
    const expDate = new Date(2000 + yy, mm);
    if (expDate < now) return "This card has expired.";
    if (!/^\d{3,4}$/.test(cvv)) return "Enter a valid CVV.";
    return "";
  }

  function validateMomo() {
    if (!/^0\d{9}$/.test(momoNumber)) return "Enter a valid 10-digit mobile number (e.g. 0770123456).";
    return "";
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const err = method === "visa" ? validateCard() : validateMomo();
    if (err) {
      setError(err);
      return;
    }
    setProcessing(true);
    // Simulated payment processing delay — in production this calls a real
    // payment gateway (Stripe for Visa/Mastercard, the Lonestar MTN MoMo API
    // and Orange Money API for Mobile Money) from a secure backend. See README.md.
    setTimeout(() => {
      setProcessing(false);
      onSuccess({
        method,
        reference: `${method.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
        last4: method === "visa" ? cardNumber.replace(/\D/g, "").slice(-4) : momoNumber.slice(-4),
        network: method === "momo" ? network : undefined,
      });
    }, 1600);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setMethod("visa")}
          className={`border rounded-lg p-3 text-left transition-colors ${
            method === "visa" ? "border-teal bg-teal/5" : "border-ink/15 hover:border-ink/30"
          }`}
        >
          <div className="font-semibold text-sm">Visa / Mastercard</div>
          <div className="text-xs text-ink/50 mt-0.5">Pay with a debit or credit card</div>
        </button>
        <button
          type="button"
          onClick={() => setMethod("momo")}
          className={`border rounded-lg p-3 text-left transition-colors ${
            method === "momo" ? "border-teal bg-teal/5" : "border-ink/15 hover:border-ink/30"
          }`}
        >
          <div className="font-semibold text-sm">Mobile Money</div>
          <div className="text-xs text-ink/50 mt-0.5">Lonestar MTN, Orange Money</div>
        </button>
      </div>

      {method === "visa" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Name on card</label>
            <input
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              placeholder="Prince Toe"
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Card number</label>
            <input
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
              placeholder="4242 4242 4242 4242"
              inputMode="numeric"
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink/70 mb-1">Expiry (MM/YY)</label>
              <input
                value={expiry}
                onChange={(e) => {
                  let v = e.target.value.replace(/\D/g, "").slice(0, 4);
                  if (v.length > 2) v = `${v.slice(0, 2)}/${v.slice(2)}`;
                  setExpiry(v);
                }}
                placeholder="09/28"
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/70 mb-1">CVV</label>
              <input
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="123"
                inputMode="numeric"
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal font-mono"
              />
            </div>
          </div>
          <p className="text-[11px] text-ink/40">
            Demo mode: use any Luhn-valid number, e.g. 4242 4242 4242 4242. No real charge occurs.
          </p>
        </div>
      )}

      {method === "momo" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Network</label>
            <div className="grid grid-cols-2 gap-2">
              {MOMO_NETWORKS.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => setNetwork(n.id)}
                  className={`text-xs font-medium border rounded-md py-2 px-1 ${
                    network === n.id
                      ? "border-teal bg-teal/5 text-teal-600"
                      : "border-ink/15 text-ink/60 hover:border-ink/30"
                  }`}
                >
                  {n.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Mobile Money number</label>
            <input
              value={momoNumber}
              onChange={(e) => setMomoNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="0770123456"
              inputMode="numeric"
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal font-mono"
            />
          </div>
          <p className="text-[11px] text-ink/40">
            Demo mode: you'll receive a simulated prompt approval — no real request is sent to your phone.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-coral-600">{error}</p>}

      <button
        type="submit"
        disabled={processing || disabled}
        className="w-full bg-mango hover:bg-mango-400 disabled:opacity-60 text-indigo-950 font-semibold py-3 rounded-md transition-colors"
      >
        {processing ? "Processing payment…" : `Pay ${amountLabel}`}
      </button>
    </form>
  );
}
