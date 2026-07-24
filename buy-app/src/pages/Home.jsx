import { useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../context/DataContext";
import CategoryStrip from "../components/CategoryStrip";
import ProductCard from "../components/ProductCard";
import StoreCard from "../components/StoreCard";
import StoreLogo from "../components/StoreLogo";
import HeroSlider from "../components/HeroSlider";

const FEATURES = [
  { icon: "🚚", title: "Free delivery", subtitle: "On orders over $50" },
  { icon: "🔒", title: "Secure payment", subtitle: "Mobile Money & Visa" },
  { icon: "↩️", title: "Buyer protection", subtitle: "Vendor-verified stores" },
  { icon: "💬", title: "Online support", subtitle: "We're here to help" },
];

const TABS = [
  { key: "new", label: "New Arrivals" },
  { key: "best", label: "Best Selling" },
  { key: "top", label: "Top Rated" },
];

export default function Home() {
  const { products, stores, categories } = useData();
  const [tab, setTab] = useState("new");

  const active = products.filter((p) => p.status === "active");
  const deals = active.filter((p) => p.compareAtPrice).slice(0, 5);
  const approvedStores = stores.filter((s) => s.status === "approved");

  const tabbedProducts = {
    new: [...active].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    best: [...active].sort((a, b) => (b.reviews || 0) - (a.reviews || 0)),
    top: [...active].sort((a, b) => (b.rating || 0) - (a.rating || 0)),
  }[tab].slice(0, 10);

  return (
    <div>
      <HeroSlider mode="shop" />

      <div className="max-w-7xl mx-auto px-4">
        {/* Feature strip */}
        <section className="py-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex items-center gap-3">
              <span className="text-2xl">{f.icon}</span>
              <div>
                <p className="text-sm font-semibold text-ink">{f.title}</p>
                <p className="text-xs text-ink/50">{f.subtitle}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Categories */}
        <section className="py-4">
          <h2 className="font-display text-xl font-semibold mb-4">Shop by category</h2>
          <CategoryStrip />
        </section>

        {/* Promo tiles */}
        <section className="py-8 grid md:grid-cols-3 gap-4">
          <Link
            to="/food"
            className="relative rounded-xl overflow-hidden p-6 min-h-[160px] flex flex-col justify-end text-white"
            style={{ background: "linear-gradient(145deg, #C8102E 0%, #8c0b21 100%)" }}
          >
            <span className="text-3xl mb-2">🍲</span>
            <p className="text-xs uppercase tracking-wide text-white/70">Now delivering</p>
            <h3 className="font-display text-xl font-semibold">Order food</h3>
            <span className="text-sm underline mt-1">Browse restaurants →</span>
          </Link>
          <Link
            to="/sourcing"
            className="relative rounded-xl overflow-hidden p-6 min-h-[160px] flex flex-col justify-end text-white"
            style={{ background: "linear-gradient(145deg, #1F7A4D 0%, #124f30 100%)" }}
          >
            <span className="text-3xl mb-2">🇨🇳</span>
            <p className="text-xs uppercase tracking-wide text-white/70">Sourcing</p>
            <h3 className="font-display text-xl font-semibold">Ship from China</h3>
            <span className="text-sm underline mt-1">Request a quote →</span>
          </Link>
          <Link
            to="/sell"
            className="relative rounded-xl overflow-hidden p-6 min-h-[160px] flex flex-col justify-end text-white"
            style={{ background: "linear-gradient(145deg, #7030A0 0%, #491F68 100%)" }}
          >
            <span className="text-3xl mb-2">🏪</span>
            <p className="text-xs uppercase tracking-wide text-white/70">For vendors</p>
            <h3 className="font-display text-xl font-semibold">Sell on Yana Buy</h3>
            <span className="text-sm underline mt-1">Open your store →</span>
          </Link>
        </section>

        {/* Deals */}
        {deals.length > 0 && (
          <section className="py-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-semibold">Today's deals</h2>
              <span className="text-xs font-mono text-coral-600 bg-coral/10 px-2 py-1 rounded-full">
                Save up to {Math.max(...deals.map((p) => Math.round(100 - (p.price / p.compareAtPrice) * 100)))}%
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {deals.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

        {/* Featured products with tabs */}
        <section className="py-8">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="font-display text-xl font-semibold">Featured Products</h2>
            <div className="flex gap-1 bg-sand rounded-full p-1">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                    tab === t.key ? "bg-indigo-900 text-white" : "text-ink/60 hover:text-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {tabbedProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>

        {/* Stores */}
        {approvedStores.length > 0 && (
          <section className="py-8">
            <h2 className="font-display text-xl font-semibold mb-4">Featured stores</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {approvedStores.map((s) => (
                <StoreCard
                  key={s.id}
                  store={s}
                  productCount={products.filter((p) => p.storeId === s.id && p.status === "active").length}
                />
              ))}
            </div>
          </section>
        )}

        {/* Featured categories */}
        <section className="py-8 pb-16">
          <h2 className="font-display text-xl font-semibold mb-4">Featured Categories</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {categories.map((c) => (
              <Link
                key={c.id}
                to={`/category/${c.id}`}
                className="bg-white border border-ink/[0.06] rounded-xl p-4 flex flex-col items-center gap-2 shadow-soft hover:shadow-lift hover:-translate-y-0.5 transition-all duration-200 text-center"
              >
                <StoreLogo
                  image={c.iconImage}
                  emoji={c.icon}
                  color={c.color}
                  sizeClass="w-12 h-12"
                  textSizeClass="text-xl"
                />
                <span className="text-xs font-medium text-ink/80 leading-tight">{c.name}</span>
                <span className="text-[11px] text-ink/40">
                  {products.filter((p) => p.category === c.id && p.status === "active").length} items
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
