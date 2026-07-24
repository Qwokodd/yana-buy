import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useData } from "../context/DataContext";
import ProductCard from "../components/ProductCard";
import StoreLogo from "../components/StoreLogo";

export default function CategoryPage() {
  const { id } = useParams();
  const { categories, products } = useData();
  const [sort, setSort] = useState("relevance");
  const [maxPrice, setMaxPrice] = useState("");

  const category = categories.find((c) => c.id === id);
  const list = useMemo(() => {
    let items = products.filter((p) => p.category === id && p.status === "active");
    if (maxPrice) items = items.filter((p) => p.price <= Number(maxPrice));
    if (sort === "price-asc") items = [...items].sort((a, b) => a.price - b.price);
    if (sort === "price-desc") items = [...items].sort((a, b) => b.price - a.price);
    if (sort === "rating") items = [...items].sort((a, b) => b.rating - a.rating);
    return items;
  }, [products, id, sort, maxPrice]);

  if (!category) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <p className="text-ink/60">This category doesn't exist.</p>
        <Link to="/" className="text-teal-600 font-medium">Back to home</Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <StoreLogo
          image={category.iconImage}
          emoji={category.icon}
          color={category.color}
          sizeClass="w-12 h-12"
          textSizeClass="text-xl"
        />
        <div>
          <h1 className="font-display text-2xl font-semibold">{category.name}</h1>
          <p className="text-sm text-ink/50">{list.length} products</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6 bg-white border border-ink/10 rounded-lg p-3">
        <label className="text-sm text-ink/60 flex items-center gap-2">
          Sort by
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="border border-ink/15 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="relevance">Relevance</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="rating">Top rated</option>
          </select>
        </label>
        <label className="text-sm text-ink/60 flex items-center gap-2">
          Max price
          <input
            type="number"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Any"
            className="w-24 border border-ink/15 rounded-md px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      {list.length === 0 ? (
        <p className="text-ink/50 py-12 text-center">No products match these filters yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {list.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
