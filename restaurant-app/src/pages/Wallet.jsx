import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import DashboardShell from "../components/DashboardShell";
import StatCard from "../components/StatCard";
import Badge from "../components/Badge";
import { RESTAURANT_LINKS } from "./RestaurantDashboard";
import { formatPrice, formatUSD } from "../utils/storage";

const MIN_PAYOUT = 5; // smallest cash-out amount worth a mobile money transfer

// This wallet is shared with any marketplace store the same vendor account
// runs on the buy app -- commission from both settles into one balance,
// since it's the same vendor cashing out to the same mobile money number.
export default function Wallet() {
  const { currentUser } = useAuth();
  const { walletForVendor, payoutsForVendor, requestPayout } = useData();

  const wallet = walletForVendor(currentUser.id);
  const myPayouts = payoutsForVendor(currentUser.id);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("mtn");
  const [destination, setDestination] = useState(currentUser.phone || "");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const amt = Number(amount);
    if (!amt || amt <= 0) return setError("Enter an amount greater than 0.");
    if (amt < MIN_PAYOUT) return setError(`Minimum payout is ${formatUSD(MIN_PAYOUT)}.`);
    if (amt > wallet.balance) return setError("That's more than your available balance.");
    if (!destination.trim()) return setError("Enter the mobile money number to send funds to.");

    requestPayout({ vendorId: currentUser.id, amount: amt, method, destination: destination.trim() });
    setAmount("");
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  }

  return (
    <DashboardShell title="Restaurant dashboard" subtitle={currentUser.email} links={RESTAURANT_LINKS}>
      <h2 className="font-display font-semibold mb-4">Wallet &amp; payouts</h2>

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Available balance" value={formatPrice(wallet.balance)} accent="mango" />
        <StatCard label="Total sales" value={formatPrice(wallet.totalSales)} accent="indigo" />
        <StatCard label="Commission paid (10%)" value={formatPrice(wallet.totalCommission)} accent="coral" />
      </div>

      <div className="grid md:grid-cols-[1fr_320px] gap-6">
        <div className="bg-white border border-ink/10 rounded-lg p-5">
          <h3 className="font-display font-semibold mb-4">Payout history</h3>
          {myPayouts.length === 0 ? (
            <p className="text-sm text-ink/50">No payout requests yet.</p>
          ) : (
            <div className="space-y-3">
              {myPayouts.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm border-b border-ink/5 pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium">{formatPrice(r.amount)}</p>
                    <p className="text-xs text-ink/50 uppercase">
                      {r.method} · {r.destination} · {new Date(r.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge status={r.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-ink/10 rounded-lg p-5 h-fit">
          <h3 className="font-display font-semibold mb-1">Request a payout</h3>
          <p className="text-xs text-ink/50 mb-4">
            Funds are sent to your mobile money number after admin approval. Minimum {formatUSD(MIN_PAYOUT)}.
          </p>

          {submitted && (
            <div className="mb-3 text-xs bg-teal/10 text-teal-600 rounded-md px-3 py-2">
              Payout requested — you'll see it move from Available balance and appear below.
            </div>
          )}
          {error && (
            <div className="mb-3 text-xs bg-coral/10 text-coral-600 rounded-md px-3 py-2">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-ink/60 font-medium mb-1 block">Amount (USD)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Up to ${formatUSD(wallet.balance)}`}
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
              />
            </div>
            <div>
              <label className="text-xs text-ink/60 font-medium mb-1 block">Mobile money provider</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
              >
                <option value="mtn">MTN Mobile Money</option>
                <option value="orange">Orange Money</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-ink/60 font-medium mb-1 block">Number to receive funds</label>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="0777123456"
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
              />
            </div>
            <button
              type="submit"
              disabled={wallet.balance < MIN_PAYOUT}
              className="w-full bg-mango hover:bg-mango-400 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-950 font-semibold px-5 py-2.5 rounded-md text-sm"
            >
              Request payout
            </button>
          </form>
        </div>
      </div>
    </DashboardShell>
  );
}
