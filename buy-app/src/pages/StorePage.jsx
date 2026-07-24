import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useData } from "../context/DataContext";
import ProductCard from "../components/ProductCard";
import StoreLogo from "../components/StoreLogo";

export default function StorePage() {
  const { id } = useParams();
  const { stores, products, categories } = useData();
  const [activeCategory, setActiveCategory] = useState("all");

  const store = stores.find((s) => s.id === id);
  const storeProducts = useMemo(
    () => products.filter((p) => p.storeId === id && p.status === "active"),
    [products, id]
  );
  const storeCategories = useMemo(
    () => categories.filter((c) => storeProducts.some((p) => p.category === c.id)),
    [categories, storeProducts]
  );
  const shown =
    activeCategory === "all" ? storeProducts : storeProducts.filter((p) => p.category === activeCategory);

  if (!store || store.status !== "approved") {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <p className="text-ink/60">This store isn't available.</p>
        <Link to="/" className="text-teal-600 font-medium">Back to home</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="text-white" style={{ background: store.color }}>
        <div className="max-w-7xl mx-auto px-4 py-10 flex items-center gap-5">
          <StoreLogo
            image={store.logoImage}
            emoji={store.logoEmoji}
            style={{ background: "rgba(255,255,255,0.15)" }}
            sizeClass="w-20 h-20"
            textSizeClass="text-4xl"
          />
          <div>
            <h1 className="font-display text-3xl font-semibold">{store.name}</h1>
            <p className="text-white/80 text-sm mt-1 max-w-xl">{store.description}</p>
            <p className="text-white/60 text-xs mt-2">{store.location} · {storeProducts.length} products</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex gap-2 overflow-x-auto scrollbar-none mb-6">
          <button
            onClick={() => setActiveCategory("all")}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border ${
              activeCategory === "all" ? "bg-indigo-950 text-white border-indigo-950" : "border-ink/15 text-ink/60"
            }`}
          >
            All
          </button>
          {storeCategories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border ${
                activeCategory === c.id ? "bg-indigo-950 text-white border-indigo-950" : "border-ink/15 text-ink/60"
              }`}
            >
              {c.icon} {c.name}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="text-ink/50 py-12 text-center">No products in this category yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {shown.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
