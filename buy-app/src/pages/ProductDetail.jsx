import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useData } from "../context/DataContext";
import { useCart } from "../context/CartContext";
import ImageGallery from "../components/ImageGallery";
import ProductCard from "../components/ProductCard";
import RatingStars from "../components/RatingStars";
import ChinaBadge from "../components/ChinaBadge";
import StoreLogo from "../components/StoreLogo";
import { formatPrice } from "../utils/storage";

export default function ProductDetail() {
  const { id } = useParams();
  const { products, stores, categories } = useData();
  const { addItem } = useCart();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const product = products.find((p) => p.id === id);

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <p className="text-ink/60">This product is no longer available.</p>
        <Link to="/" className="text-teal-600 font-medium">Back to home</Link>
      </div>
    );
  }

  const store = product.storeId ? stores.find((s) => s.id === product.storeId) : null;
  const category = categories.find((c) => c.id === product.category);
  const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;
  const related = products
    .filter((p) => p.category === product.category && p.id !== product.id && p.status === "active")
    .slice(0, 5);

  function handleAdd() {
    addItem(product.id, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  }

  function handleBuyNow() {
    addItem(product.id, qty);
    navigate("/cart");
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <nav className="text-xs text-ink/50 mb-4">
        <Link to="/" className="hover:text-teal-600">Home</Link>
        {category && (
          <>
            {" / "}
            <Link to={`/category/${category.id}`} className="hover:text-teal-600">
              {category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="grid md:grid-cols-2 gap-10">
        <div>
          <ImageGallery
            images={product.images}
            emoji={product.emoji}
            categoryColor={category?.color}
          />
        </div>

        <div>
          <h1 className="font-display text-2xl font-semibold leading-snug">{product.title}</h1>
          <div className="mt-2">
            <RatingStars rating={product.rating} reviews={product.reviews} />
          </div>

          <div className="mt-4 flex items-baseline gap-3">
            <span className="font-mono text-3xl font-semibold text-indigo-900">
              {formatPrice(product.price)}
            </span>
            {hasDiscount && (
              <>
                <span className="font-mono text-ink/40 line-through">
                  {formatPrice(product.compareAtPrice)}
                </span>
                <span className="text-coral-600 text-sm font-semibold">
                  Save {Math.round(100 - (product.price / product.compareAtPrice) * 100)}%
                </span>
              </>
            )}
          </div>

          <p className="mt-4 text-sm text-ink/70 leading-relaxed">{product.description}</p>

          <div className="mt-4 flex items-center gap-3 text-sm flex-wrap">
            {product.stock > 0 ? (
              <span className="text-teal-600 font-medium">
                In stock {product.stock <= 5 ? `— only ${product.stock} left` : ""}
              </span>
            ) : (
              <span className="text-coral-600 font-medium">Out of stock</span>
            )}
            {product.shipsFromChina && <ChinaBadge days={product.chinaDeliveryDays} />}
          </div>

          {/* seller card */}
          <div className="mt-6 border border-ink/10 rounded-lg p-4">
            {store ? (
              <Link to={`/store/${store.id}`} className="flex items-center gap-3 group">
                <StoreLogo
                  image={store.logoImage}
                  emoji={store.logoEmoji}
                  color={store.color}
                  sizeClass="w-10 h-10"
                  textSizeClass="text-lg"
                />
                <div>
                  <p className="text-sm font-semibold group-hover:text-teal-600">{store.name}</p>
                  <p className="text-xs text-ink/50">{store.location} · Visit store</p>
                </div>
              </Link>
            ) : (
              <div>
                <p className="text-sm font-semibold">Sold by {product.sellerName}</p>
                <p className="text-xs text-ink/50">Individual seller · listing verified by Yana Buy admin</p>
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <div className="flex items-center border border-ink/15 rounded-md">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="w-9 h-10 text-ink/60 hover:bg-sand"
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="w-10 text-center text-sm font-medium">{qty}</span>
              <button
                onClick={() => setQty((q) => Math.min(product.stock || 1, q + 1))}
                className="w-9 h-10 text-ink/60 hover:bg-sand"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>

            <button
              onClick={handleAdd}
              disabled={product.stock === 0}
              className="flex-1 border border-indigo-900 text-indigo-900 font-semibold py-2.5 rounded-md hover:bg-indigo-950/5 disabled:opacity-40"
            >
              {added ? "Added ✓" : "Add to cart"}
            </button>
            <button
              onClick={handleBuyNow}
              disabled={product.stock === 0}
              className="flex-1 bg-mango hover:bg-mango-400 text-indigo-950 font-semibold py-2.5 rounded-md disabled:opacity-40"
            >
              Buy now
            </button>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-14">
          <h2 className="font-display text-xl font-semibold mb-4">You may also like</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
