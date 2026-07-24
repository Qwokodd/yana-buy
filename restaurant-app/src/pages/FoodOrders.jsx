import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import DashboardShell from "../components/DashboardShell";
import Badge from "../components/Badge";
import { RESTAURANT_LINKS } from "./RestaurantDashboard";
import { formatPrice } from "../utils/storage";

export default function FoodOrders() {
  const { currentUser } = useAuth();
  const { restaurantForOwner, foodOrders, updateFoodOrderStatus } = useData();
  const restaurant = restaurantForOwner(currentUser.id);
  const myOrders = restaurant ? foodOrders.filter((o) => o.restaurantId === restaurant.id) : [];

  if (!restaurant) {
    return (
      <DashboardShell title="Restaurant dashboard" subtitle={currentUser.email} links={RESTAURANT_LINKS}>
        <p className="text-ink/60">Open a restaurant first to start receiving food orders.</p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Restaurant dashboard" subtitle={restaurant.name} links={RESTAURANT_LINKS}>
      <h2 className="font-display font-semibold mb-4">Food orders ({myOrders.length})</h2>
      {myOrders.length === 0 ? (
        <div className="bg-white border border-ink/10 rounded-lg p-8 text-center text-ink/50">
          No orders for your restaurant yet.
        </div>
      ) : (
        <div className="space-y-3">
          {myOrders.map((o) => (
            <div key={o.id} className="bg-white border border-ink/10 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-mono text-sm font-semibold">#{o.id.slice(-6).toUpperCase()}</p>
                <select
                  value={o.status}
                  onChange={(e) => updateFoodOrderStatus(o.id, e.target.value)}
                  className="border border-ink/15 rounded-md px-2 py-1 text-xs capitalize"
                >
                  <option value="placed">Placed</option>
                  <option value="preparing">Preparing</option>
                  <option value="out_for_delivery">Out for delivery</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div className="mb-2"><Badge status={o.status} /></div>
              <ul className="text-sm text-ink/70 space-y-1">
                {o.items.map((i) => (
                  <li key={i.menuItemId} className="flex justify-between">
                    <span>{i.qty}× {i.name}</span>
                    <span className="font-mono">{formatPrice(i.price * i.qty)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between text-sm mt-2 pt-2 border-t border-ink/10">
                <span className="text-ink/60">Total (incl. delivery)</span>
                <span className="font-mono">{formatPrice(o.total)}</span>
              </div>
              {typeof o.commission === "number" && (
                <>
                  <div className="flex justify-between text-xs text-coral-600">
                    <span>Yana Buy commission (10% of food subtotal)</span>
                    <span className="font-mono">−{formatPrice(o.commission)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-sm pt-1">
                    <span>Your earnings</span>
                    <span className="font-mono">{formatPrice(o.vendorEarnings)}</span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
