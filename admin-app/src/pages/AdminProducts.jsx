import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import DashboardShell from "../components/DashboardShell";
import Badge from "../components/Badge";
import { ADMIN_LINKS } from "./AdminDashboard";
import { formatPrice } from "../utils/storage";
import { imageUrl } from "../utils/upload";

export default function AdminProducts() {
  const { currentUser } = useAuth();
  const { products, stores, updateProduct, deleteProduct } = useData();
  const [filter, setFilter] = useState("all");

  const list =
    filter === "all" ? products : products.filter((p) => p.sellerType === filter);

  return (
    <DashboardShell title="Admin dashboard" subtitle={currentUser.email} links={ADMIN_LINKS}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="font-display font-semibold">Products ({list.length})</h2>
        <Link to="/products/new" className="bg-mango hover:bg-mango-400 text-indigo-950 font-semibold px-4 py-2 rounded-md text-sm">
          + List for an individual seller
        </Link>
      </div>

      <div className="flex gap-2 mb-4">
        {["all", "store", "individual"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
              filter === f ? "bg-indigo-950 text-white border-indigo-950" : "border-ink/15 text-ink/60"
            }`}
          >
            {f === "all" ? "All" : f === "store" ? "Vendor stores" : "Individual sellers"}
          </button>
        ))}
      </div>

      <div className="bg-white border border-ink/10 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-sand text-ink/60 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Product</th>
              <th className="text-left px-4 py-2">Seller</th>
              <th className="text-left px-4 py-2">Price</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const store = p.storeId ? stores.find((s) => s.id === p.storeId) : null;
              return (
                <tr key={p.id} className="border-t border-ink/5">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {p.images?.[0] ? (
                        <img src={imageUrl(p.images[0])} alt="" className="w-8 h-8 rounded object-cover" />
                      ) : (
                        <span className="text-lg">{p.emoji}</span>
                      )}
                      <span className="line-clamp-1 max-w-xs">{p.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {store ? store.name : `${p.sellerName} (individual)`}
                  </td>
                  <td className="px-4 py-3 font-mono">{formatPrice(p.price)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => updateProduct(p.id, { status: p.status === "active" ? "draft" : "active" })}>
                      <Badge status={p.status} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        if (confirm(`Remove "${p.title}" from the marketplace?`)) deleteProduct(p.id);
                      }}
                      className="text-coral-600 text-xs font-medium"
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
