import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import DashboardShell from "../components/DashboardShell";
import Badge from "../components/Badge";
import StatCard from "../components/StatCard";
import { ADMIN_LINKS } from "./AdminDashboard";
import { formatPrice } from "../utils/storage";

export default function AdminPayouts() {
  const { currentUser, users } = useAuth();
  const { payoutRequests, vendorWallets, updatePayoutStatus } = useData();

  const pending = payoutRequests.filter((r) => r.status === "pending");
  const totalPending = pending.reduce((s, r) => s + r.amount, 0);
  const totalHeldInWallets = Object.values(vendorWallets).reduce((s, w) => s + w.balance, 0);

  function vendorName(vendorId) {
    const u = users.find((x) => x.id === vendorId);
    return u ? u.name : vendorId;
  }

  return (
    <DashboardShell title="Admin dashboard" subtitle={currentUser.email} links={ADMIN_LINKS}>
      <h2 className="font-display font-semibold mb-4">Vendor payouts</h2>

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Pending requests" value={pending.length} accent="mango" />
        <StatCard label="Pending amount" value={formatPrice(totalPending)} accent="coral" />
        <StatCard label="Total held in vendor wallets" value={formatPrice(totalHeldInWallets)} accent="indigo" />
      </div>

      {payoutRequests.length === 0 ? (
        <div className="bg-white border border-ink/10 rounded-lg p-8 text-center text-ink/50">
          No payout requests yet.
        </div>
      ) : (
        <div className="bg-white border border-ink/10 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sand text-ink/60 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Requested</th>
                <th className="text-left px-4 py-2">Vendor</th>
                <th className="text-left px-4 py-2">Amount</th>
                <th className="text-left px-4 py-2">Send to</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payoutRequests.map((r) => (
                <tr key={r.id} className="border-t border-ink/5">
                  <td className="px-4 py-3">
                    <p className="text-xs text-ink/50">{new Date(r.createdAt).toLocaleDateString()}</p>
                  </td>
                  <td className="px-4 py-3">{vendorName(r.vendorId)}</td>
                  <td className="px-4 py-3 font-mono">{formatPrice(r.amount)}</td>
                  <td className="px-4 py-3 text-xs uppercase">{r.method} · {r.destination}</td>
                  <td className="px-4 py-3"><Badge status={r.status} /></td>
                  <td className="px-4 py-3 text-right space-x-3">
                    {r.status === "pending" && (
                      <>
                        <button
                          onClick={() => updatePayoutStatus(r.id, "approved")}
                          className="text-teal-600 text-xs font-medium"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Reject this ${formatPrice(r.amount)} payout? The amount will be returned to the vendor's wallet.`)) {
                              updatePayoutStatus(r.id, "rejected");
                            }
                          }}
                          className="text-coral-600 text-xs font-medium"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {r.status === "approved" && (
                      <button
                        onClick={() => updatePayoutStatus(r.id, "paid")}
                        className="text-teal-600 text-xs font-medium"
                      >
                        Mark as paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}
