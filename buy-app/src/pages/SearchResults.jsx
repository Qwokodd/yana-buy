import { useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useData } from "../context/DataContext";
import ProductCard from "../components/ProductCard";
import StoreCard from "../components/StoreCard";

export default function SearchResults() {
  const [params] = useSearchParams();
  const q = (params.get("q") || "").trim().toLowerCase();
  const { products, stores } = useData();

  const matchedProducts = useMemo(() => {
    if (!q) return products.filter((p) => p.status === "active");
    return products.filter(
      (p) =>
        p.status === "active" &&
        (p.title.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))
    );
  }, [products, q]);

  const matchedStores = useMemo(() => {
    const approved = stores.filter((s) => s.status === "approved");
    if (!q) return approved;
    return approved.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q)
    );
  }, [stores, q]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-semibold mb-1">
        {q ? `Results for "${q}"` : "All stores & products"}
      </h1>
      <p className="text-sm text-ink/50 mb-6">
        {matchedProducts.length} products · {matchedStores.length} stores
      </p>

      {matchedStores.length > 0 && (
        <section className="mb-10">
          <h2 className="font-display text-lg font-semibold mb-3">Stores</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {matchedStores.map((s) => (
              <StoreCard key={s.id} store={s} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-display text-lg font-semibold mb-3">Products</h2>
        {matchedProducts.length === 0 ? (
          <div className="text-center py-12 text-ink/50">
            No products found. Try a different search or{" "}
            <Link to="/" className="text-teal-600 font-medium">browse categories</Link>.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {matchedProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
