import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import DashboardShell from "../components/DashboardShell";
import Badge from "../components/Badge";
import { ADMIN_LINKS } from "./AdminDashboard";
import { formatPrice } from "../utils/storage";

export default function AdminFoodOrders() {
  const { currentUser, users } = useAuth();
  const { foodOrders, updateFoodOrderStatus, restaurants } = useData();

  return (
    <DashboardShell title="Admin dashboard" subtitle={currentUser.email} links={ADMIN_LINKS}>
      <h2 className="font-display font-semibold mb-4">Food orders ({foodOrders.length})</h2>

      {foodOrders.length === 0 ? (
        <div className="bg-white border border-ink/10 rounded-lg p-8 text-center text-ink/50">
          No food orders placed yet.
        </div>
      ) : (
        <div className="bg-white border border-ink/10 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sand text-ink/60 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Order</th>
                <th className="text-left px-4 py-2">Customer</th>
                <th className="text-left px-4 py-2">Restaurant</th>
                <th className="text-left px-4 py-2">Total</th>
                <th className="text-left px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {foodOrders.map((o) => {
                const customer = users.find((u) => u.id === o.customerId);
                const restaurant = restaurants.find((r) => r.id === o.restaurantId);
                return (
                  <tr key={o.id} className="border-t border-ink/5">
                    <td className="px-4 py-3">
                      <p className="font-mono">#{o.id.slice(-6).toUpperCase()}</p>
                      <p className="text-xs text-ink/50">{new Date(o.createdAt).toLocaleDateString()}</p>
                    </td>
                    <td className="px-4 py-3">{customer?.name || "—"}</td>
                    <td className="px-4 py-3">{restaurant?.name || "—"}</td>
                    <td className="px-4 py-3 font-mono">{formatPrice(o.total)}</td>
                    <td className="px-4 py-3">
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
                      <span className="ml-2"><Badge status={o.status} /></span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}
