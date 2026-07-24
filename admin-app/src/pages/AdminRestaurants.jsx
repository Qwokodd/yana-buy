import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import DashboardShell from "../components/DashboardShell";
import Badge from "../components/Badge";
import StoreLogo from "../components/StoreLogo";
import { ADMIN_LINKS } from "./AdminDashboard";

export default function AdminRestaurants() {
  const { currentUser, users } = useAuth();
  const { restaurants, updateRestaurant, deleteRestaurant, menuItems } = useData();

  return (
    <DashboardShell title="Admin dashboard" subtitle={currentUser.email} links={ADMIN_LINKS}>
      <h2 className="font-display font-semibold mb-4">Restaurants ({restaurants.length})</h2>
      <div className="bg-white border border-ink/10 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-sand text-ink/60 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Restaurant</th>
              <th className="text-left px-4 py-2">Owner</th>
              <th className="text-left px-4 py-2">Menu items</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {restaurants.map((r) => {
              const owner = users.find((u) => u.id === r.ownerId);
              const count = menuItems.filter((m) => m.restaurantId === r.id).length;
              return (
                <tr key={r.id} className="border-t border-ink/5">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StoreLogo
                        image={r.logoImage}
                        emoji={r.logoEmoji}
                        color={r.color}
                        sizeClass="w-8 h-8"
                        textSizeClass="text-base"
                      />
                      <div>
                        <p className="font-medium">{r.name}</p>
                        <p className="text-xs text-ink/50">{r.location} · {r.cuisine}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p>{owner?.name}</p>
                    <p className="text-xs text-ink/50">{owner?.email}</p>
                  </td>
                  <td className="px-4 py-3">{count}</td>
                  <td className="px-4 py-3"><Badge status={r.status} /></td>
                  <td className="px-4 py-3 text-right space-x-3">
                    {r.status !== "approved" && (
                      <button
                        onClick={() => updateRestaurant(r.id, { status: "approved" })}
                        className="text-teal-600 text-xs font-medium"
                      >
                        Approve
                      </button>
                    )}
                    {r.status !== "rejected" && (
                      <button
                        onClick={() => updateRestaurant(r.id, { status: "rejected" })}
                        className="text-coral-600 text-xs font-medium"
                      >
                        Reject
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm(`Delete restaurant "${r.name}"? This can't be undone.`)) deleteRestaurant(r.id);
                      }}
                      className="text-ink/40 text-xs font-medium"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </DashboardShell>
  );
}
