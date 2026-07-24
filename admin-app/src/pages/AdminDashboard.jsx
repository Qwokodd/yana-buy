import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import DashboardShell from "../components/DashboardShell";
import StatCard from "../components/StatCard";
import Badge from "../components/Badge";
import StoreLogo from "../components/StoreLogo";
import { formatPrice } from "../utils/storage";

export const ADMIN_LINKS = [
  { to: "/", label: "Overview", end: true },
  { to: "/vendors", label: "Vendor stores" },
  { to: "/products", label: "Products" },
  { to: "/categories", label: "Categories" },
  { to: "/hero-slides", label: "Hero slides" },
  { to: "/users", label: "Users" },
  { to: "/orders", label: "Orders" },
  { to: "/sourcing", label: "China sourcing" },
  { to: "/restaurants", label: "Restaurants" },
  { to: "/food-orders", label: "Food orders" },
  { to: "/payouts", label: "Vendor payouts" },
];

export default function AdminDashboard() {
  const { currentUser, users } = useAuth();
  const { stores, products, orders, categories, restaurants, foodOrders, sourcingRequests, vendorWallets, payoutRequests } = useData();

  const pendingStores = stores.filter((s) => s.status === "pending");
  const pendingRestaurants = restaurants.filter((r) => r.status === "pending");
  const pendingQuotes = sourcingRequests.filter((r) => r.status === "pending");
  const pendingPayouts = payoutRequests.filter((r) => r.status === "pending");
  const revenue = orders.reduce((s, o) => s + o.total, 0);
  const commissionEarned = Object.values(vendorWallets).reduce((s, w) => s + w.totalCommission, 0);

  return (
    <DashboardShell title="Admin dashboard" subtitle={currentUser.email} links={ADMIN_LINKS}>
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard label="Total vendors" value={stores.length} accent="indigo" />
        <StatCard label="Total products" value={products.length} accent="teal" />
        <StatCard label="Total orders" value={orders.length} accent="mango" />
        <StatCard label="Platform GMV" value={formatPrice(revenue)} accent="coral" />
        <StatCard label="Commission earned (10%)" value={formatPrice(commissionEarned)} accent="indigo" />
      </div>

      {pendingPayouts.length > 0 && (
        <div className="bg-white border border-mango/40 bg-mango/5 rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold">
              {pendingPayouts.length} vendor payout{pendingPayouts.length > 1 ? "s" : ""} awaiting review
            </h2>
            <Link to="/payouts" className="text-xs text-teal-600 font-medium">Review payouts</Link>
          </div>
          <ul className="space-y-2">
            {pendingPayouts.slice(0, 5).map((r) => {
              const vendor = users.find((u) => u.id === r.vendorId);
              return (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <span>{vendor?.name || r.vendorId}</span>
                  <span className="font-mono">{formatPrice(r.amount)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {pendingStores.length > 0 && (
        <div className="bg-white border border-ink/10 rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold">Stores awaiting review</h2>
            <Link to="/vendors" className="text-xs text-teal-600 font-medium">Manage all</Link>
          </div>
          <ul className="space-y-2">
            {pendingStores.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <StoreLogo image={s.logoImage} emoji={s.logoEmoji} color={s.color} sizeClass="w-6 h-6" textSizeClass="text-sm" />
                  {s.name}
                </span>
                <Badge status={s.status} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white border border-ink/10 rounded-lg p-5">
          <h2 className="font-display font-semibold mb-3">Quick stats</h2>
          <ul className="text-sm space-y-1.5 text-ink/70">
            <li>{users.filter((u) => u.role === "customer").length} customers</li>
            <li>{users.filter((u) => u.role === "vendor").length} vendors</li>
            <li>{categories.length} categories</li>
            <li>{products.filter((p) => p.sellerType === "individual").length} individual-seller listings</li>
            <li>{restaurants.length} restaurants ({pendingRestaurants.length} pending)</li>
            <li>{foodOrders.length} food orders</li>
            <li>{sourcingRequests.length} China sourcing requests ({pendingQuotes.length} awaiting quote)</li>
          </ul>
        </div>
        <div className="bg-white border border-ink/10 rounded-lg p-5">
          <h2 className="font-display font-semibold mb-3">Recent orders</h2>
          {orders.length === 0 ? (
            <p className="text-sm text-ink/50">No orders yet.</p>
          ) : (
            <ul className="text-sm space-y-1.5">
              {orders.slice(0, 5).map((o) => (
                <li key={o.id} className="flex justify-between">
                  <span className="font-mono">#{o.id.slice(-6).toUpperCase()}</span>
                  <span className="font-mono">{formatPrice(o.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
