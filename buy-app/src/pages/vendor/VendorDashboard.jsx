import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useData } from "../../context/DataContext";
import DashboardShell from "../../components/DashboardShell";
import StatCard from "../../components/StatCard";
import Badge from "../../components/Badge";
import { formatPrice } from "../../utils/storage";

export const VENDOR_LINKS = [
  { to: "/vendor", label: "Overview", end: true },
  { to: "/vendor/store", label: "Store settings" },
  { to: "/vendor/products", label: "Products" },
  { to: "/vendor/orders", label: "Orders" },
  { to: "/vendor/wallet", label: "Wallet & payouts" },
];

export default function VendorDashboard() {
  const { currentUser } = useAuth();
  const { storeForOwner, products, orders, walletForVendor } = useData();
  const store = storeForOwner(currentUser.id);
  const wallet = walletForVendor(currentUser.id);

  if (!store) {
    return (
      <DashboardShell title="Vendor dashboard" subtitle={currentUser.email} links={VENDOR_LINKS}>
        <div className="bg-white border border-ink/10 rounded-lg p-8 text-center max-w-md mx-auto">
          <div className="text-4xl mb-3">🏪</div>
          <h2 className="font-display text-lg font-semibold mb-2">Open your store</h2>
          <p className="text-sm text-ink/50 mb-5">
            You haven't set up a store yet. Create one to start listing products.
          </p>
          <Link to="/sell" className="inline-block bg-mango hover:bg-mango-400 text-indigo-950 font-semibold px-5 py-2.5 rounded-md text-sm">
            Create my store
          </Link>
        </div>
      </DashboardShell>
    );
  }

  const myProducts = products.filter((p) => p.storeId === store.id);
  const myOrders = orders.filter((o) => o.items.some((i) => i.storeId === store.id));

  return (
    <DashboardShell title="Vendor dashboard" subtitle={store.name} links={VENDOR_LINKS}>
      {store.status !== "approved" && (
        <div className="mb-6 border border-mango/40 bg-mango/10 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">
              Store status: <Badge status={store.status} />
            </p>
            <p className="text-xs text-ink/60 mt-1">
              {store.status === "pending"
                ? "Your store is awaiting admin approval and isn't visible to shoppers yet."
                : "Your store application was rejected. Contact support for details."}
            </p>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Products listed" value={myProducts.length} accent="indigo" />
        <StatCard label="Orders received" value={myOrders.length} accent="teal" />
        <StatCard label="Net earnings (after 10% fee)" value={formatPrice(wallet.totalEarned)} accent="mango" />
      </div>

      <div className="mb-8 bg-white border border-ink/10 rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-ink/50 font-medium">Available to withdraw</p>
          <p className="font-display text-xl font-semibold text-indigo-900 mt-0.5">{formatPrice(wallet.balance)}</p>
        </div>
        <Link to="/vendor/wallet" className="bg-indigo-950 hover:bg-indigo-900 text-white font-semibold px-4 py-2 rounded-md text-sm">
          Request payout
        </Link>
      </div>

      <div className="bg-white border border-ink/10 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold">Recent orders</h2>
          <Link to="/vendor/orders" className="text-xs text-teal-600 font-medium">View all</Link>
        </div>
        {myOrders.length === 0 ? (
          <p className="text-sm text-ink/50">No orders yet.</p>
        ) : (
          <ul className="space-y-2">
            {myOrders.slice(0, 5).map((o) => (
              <li key={o.id} className="flex justify-between text-sm">
                <span className="font-mono">#{o.id.slice(-6).toUpperCase()}</span>
                <span className="text-ink/50">{new Date(o.createdAt).toLocaleDateString()}</span>
                <Badge status={o.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardShell>
  );
}
