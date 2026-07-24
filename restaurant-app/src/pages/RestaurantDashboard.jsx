import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import DashboardShell from "../components/DashboardShell";
import StatCard from "../components/StatCard";
import Badge from "../components/Badge";
import { formatPrice } from "../utils/storage";

export const RESTAURANT_LINKS = [
  { to: "/", label: "Overview", end: true },
  { to: "/settings", label: "Restaurant settings" },
  { to: "/menu-items", label: "Menu items" },
  { to: "/orders", label: "Food orders" },
  { to: "/wallet", label: "Wallet & payouts" },
];

export default function RestaurantDashboard() {
  const { currentUser } = useAuth();
  const { restaurantForOwner, menuItems, foodOrders, walletForVendor } = useData();
  const restaurant = restaurantForOwner(currentUser.id);
  const wallet = walletForVendor(currentUser.id);

  if (!restaurant) {
    return (
      <DashboardShell title="Restaurant dashboard" subtitle={currentUser.email} links={RESTAURANT_LINKS}>
        <div className="bg-white border border-ink/10 rounded-lg p-8 text-center max-w-md mx-auto">
          <div className="text-4xl mb-3">🍲</div>
          <h2 className="font-display text-lg font-semibold mb-2">Open your restaurant</h2>
          <p className="text-sm text-ink/50 mb-5">
            You haven't set up a restaurant yet. Create one to start listing menu items and taking food orders.
          </p>
          <Link
            to="/settings"
            className="inline-block bg-mango hover:bg-mango-400 text-indigo-950 font-semibold px-5 py-2.5 rounded-md text-sm"
          >
            Create my restaurant
          </Link>
        </div>
      </DashboardShell>
    );
  }

  const myMenuItems = menuItems.filter((m) => m.restaurantId === restaurant.id);
  const myOrders = foodOrders.filter((o) => o.restaurantId === restaurant.id);
  // Wallet balance is shared with any marketplace store the same vendor account
  // runs -- both revenue streams settle into the one wallet/payout flow.
  const myEarnings = myOrders.reduce((s, o) => s + (o.vendorEarnings || 0), 0);

  return (
    <DashboardShell title="Restaurant dashboard" subtitle={restaurant.name} links={RESTAURANT_LINKS}>
      {restaurant.status !== "approved" && (
        <div className="mb-6 border border-mango/40 bg-mango/10 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">
              Restaurant status: <Badge status={restaurant.status} />
            </p>
            <p className="text-xs text-ink/60 mt-1">
              {restaurant.status === "pending"
                ? "Your restaurant is awaiting admin approval and isn't visible to diners yet."
                : "Your restaurant application was rejected. Contact support for details."}
            </p>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Menu items" value={myMenuItems.length} accent="indigo" />
        <StatCard label="Food orders received" value={myOrders.length} accent="teal" />
        <StatCard label="Net earnings (after 10% fee)" value={formatPrice(myEarnings)} accent="mango" />
      </div>

      <div className="mb-8 bg-white border border-ink/10 rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-ink/50 font-medium">Available to withdraw</p>
          <p className="font-display text-xl font-semibold text-indigo-900 mt-0.5">{formatPrice(wallet.balance)}</p>
        </div>
        <Link to="/wallet" className="bg-indigo-950 hover:bg-indigo-900 text-white font-semibold px-4 py-2 rounded-md text-sm">
          Request payout
        </Link>
      </div>

      <div className="bg-white border border-ink/10 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold">Recent food orders</h2>
          <Link to="/orders" className="text-xs text-teal-600 font-medium">View all</Link>
        </div>
        {myOrders.length === 0 ? (
          <p className="text-sm text-ink/50">No food orders yet.</p>
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
