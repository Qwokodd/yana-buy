import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useData } from "../../context/DataContext";
import DashboardShell from "../../components/DashboardShell";
import Badge from "../../components/Badge";
import { VENDOR_LINKS } from "./VendorDashboard";
import { formatPrice } from "../../utils/storage";
import { imageUrl } from "../../utils/upload";

export default function VendorProducts() {
  const { currentUser } = useAuth();
  const { storeForOwner, products, deleteProduct, updateProduct } = useData();
  const store = storeForOwner(currentUser.id);
  const myProducts = store ? products.filter((p) => p.storeId === store.id) : [];

  if (!store) {
    return (
      <DashboardShell title="Vendor dashboard" subtitle={currentUser.email} links={VENDOR_LINKS}>
        <p className="text-ink/60">
          You need to <a href="/sell" className="text-teal-600 font-medium">create a store</a> before adding products.
        </p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Vendor dashboard" subtitle={store.name} links={VENDOR_LINKS}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold">Products ({myProducts.length})</h2>
        <Link to="/vendor/products/new" className="bg-mango hover:bg-mango-400 text-indigo-950 font-semibold px-4 py-2 rounded-md text-sm">
          + Add product
        </Link>
      </div>

      {myProducts.length === 0 ? (
        <div className="bg-white border border-ink/10 rounded-lg p-8 text-center text-ink/50">
          No products yet. Add your first one to start selling.
        </div>
      ) : (
        <div className="bg-white border border-ink/10 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sand text-ink/60 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Product</th>
                <th className="text-left px-4 py-2">Price</th>
                <th className="text-left px-4 py-2">Stock</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {myProducts.map((p) => (
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
                  <td className="px-4 py-3 font-mono">{formatPrice(p.price)}</td>
                  <td className="px-4 py-3">{p.stock}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => updateProduct(p.id, { status: p.status === "active" ? "draft" : "active" })}>
                      <Badge status={p.status} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <Link to={`/vendor/products/${p.id}/edit`} className="text-teal-600 text-xs font-medium">Edit</Link>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${p.title}"?`)) deleteProduct(p.id);
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
