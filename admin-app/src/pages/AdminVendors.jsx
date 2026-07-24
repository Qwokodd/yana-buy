import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import DashboardShell from "../components/DashboardShell";
import Badge from "../components/Badge";
import StoreLogo from "../components/StoreLogo";
import { ADMIN_LINKS } from "./AdminDashboard";

export default function AdminVendors() {
  const { currentUser, users } = useAuth();
  const { stores, updateStore, deleteStore, products } = useData();

  return (
    <DashboardShell title="Admin dashboard" subtitle={currentUser.email} links={ADMIN_LINKS}>
      <h2 className="font-display font-semibold mb-4">Vendor stores ({stores.length})</h2>
      <div className="bg-white border border-ink/10 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-sand text-ink/60 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Store</th>
              <th className="text-left px-4 py-2">Owner</th>
              <th className="text-left px-4 py-2">Products</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => {
              const owner = users.find((u) => u.id === s.ownerId);
              const count = products.filter((p) => p.storeId === s.id).length;
              return (
                <tr key={s.id} className="border-t border-ink/5">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StoreLogo
                        image={s.logoImage}
                        emoji={s.logoEmoji}
                        color={s.color}
                        sizeClass="w-8 h-8"
                        textSizeClass="text-base"
                      />
                      <div>
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-ink/50">{s.location}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p>{owner?.name}</p>
                    <p className="text-xs text-ink/50">{owner?.email}</p>
                  </td>
                  <td className="px-4 py-3">{count}</td>
                  <td className="px-4 py-3"><Badge status={s.status} /></td>
                  <td className="px-4 py-3 text-right space-x-3">
                    {s.status !== "approved" && (
                      <button
                        onClick={() => updateStore(s.id, { status: "approved" })}
                        className="text-teal-600 text-xs font-medium"
                      >
                        Approve
                      </button>
                    )}
                    {s.status !== "rejected" && (
                      <button
                        onClick={() => updateStore(s.id, { status: "rejected" })}
                        className="text-coral-600 text-xs font-medium"
                      >
                        Reject
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm(`Delete store "${s.name}"? This can't be undone.`)) deleteStore(s.id);
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
