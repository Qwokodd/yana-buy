import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import DashboardShell from "../components/DashboardShell";
import Badge from "../components/Badge";
import { RESTAURANT_LINKS } from "./RestaurantDashboard";
import { formatPrice } from "../utils/storage";
import { imageUrl } from "../utils/upload";

export default function MenuItems() {
  const { currentUser } = useAuth();
  const { restaurantForOwner, menuItems, deleteMenuItem, updateMenuItem } = useData();
  const restaurant = restaurantForOwner(currentUser.id);
  const myItems = restaurant ? menuItems.filter((m) => m.restaurantId === restaurant.id) : [];

  if (!restaurant) {
    return (
      <DashboardShell title="Restaurant dashboard" subtitle={currentUser.email} links={RESTAURANT_LINKS}>
        <p className="text-ink/60">
          You need to{" "}
          <Link to="/settings" className="text-teal-600 font-medium">open a restaurant</Link>{" "}
          before adding menu items.
        </p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Restaurant dashboard" subtitle={restaurant.name} links={RESTAURANT_LINKS}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold">Menu items ({myItems.length})</h2>
        <Link to="/menu-items/new" className="bg-mango hover:bg-mango-400 text-indigo-950 font-semibold px-4 py-2 rounded-md text-sm">
          + Add menu item
        </Link>
      </div>

      {myItems.length === 0 ? (
        <div className="bg-white border border-ink/10 rounded-lg p-8 text-center text-ink/50">
          No menu items yet. Add your first dish to start taking orders.
        </div>
      ) : (
        <div className="bg-white border border-ink/10 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sand text-ink/60 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Item</th>
                <th className="text-left px-4 py-2">Category</th>
                <th className="text-left px-4 py-2">Price</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {myItems.map((m) => (
                <tr key={m.id} className="border-t border-ink/5">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {m.images?.[0] ? (
                        <img src={imageUrl(m.images[0])} alt="" className="w-8 h-8 rounded object-cover" />
                      ) : (
                        <span className="text-lg">{m.emoji}</span>
                      )}
                      <span className="line-clamp-1 max-w-xs">{m.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink/60">{m.category}</td>
                  <td className="px-4 py-3 font-mono">{formatPrice(m.price)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => updateMenuItem(m.id, { available: !m.available })}>
                      <Badge status={m.available ? "active" : "draft"} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <Link to={`/menu-items/${m.id}/edit`} className="text-teal-600 text-xs font-medium">Edit</Link>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${m.name}"?`)) deleteMenuItem(m.id);
                      }}
                      className="text-coral-600 text-xs font-medium"
                    >
                      Delete
                    </button>
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
