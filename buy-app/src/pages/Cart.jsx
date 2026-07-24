import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useData } from "../context/DataContext";
import { useAuth } from "../context/AuthContext";
import ProductThumb from "../components/ProductThumb";
import { formatPrice } from "../utils/storage";

export default function Cart() {
  const { items, setQty, removeItem } = useCart();
  const { products } = useData();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const lines = items
    .map((i) => ({ ...i, product: products.find((p) => p.id === i.productId) }))
    .filter((l) => l.product);

  const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0);
  const delivery = subtotal > 0 ? 20 : 0;
  const total = subtotal + delivery;

  function handleCheckout() {
    if (!currentUser) {
      navigate("/login", { state: { from: "/checkout" } });
      return;
    }
    navigate("/checkout");
  }

  if (lines.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="text-5xl mb-4">🛒</div>
        <h1 className="font-display text-2xl font-semibold mb-2">Your cart is empty</h1>
        <p className="text-sm text-ink/50 mb-6">Browse categories and add something you love.</p>
        <Link to="/" className="inline-block bg-indigo-950 text-white font-semibold px-5 py-2.5 rounded-md">
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 grid md:grid-cols-[1fr_320px] gap-8">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-6">Your cart ({lines.length})</h1>
        <div className="space-y-4">
          {lines.map((l) => (
            <div
              key={l.productId}
              className="flex gap-4 bg-white border border-ink/10 rounded-lg p-3"
            >
              <Link to={`/product/${l.product.id}`} className="w-20 h-20 rounded-md overflow-hidden shrink-0">
                <ProductThumb product={l.product} className="w-full h-full" />
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={`/product/${l.product.id}`} className="text-sm font-medium hover:text-teal-600 line-clamp-2">
                  {l.product.title}
                </Link>
                <p className="font-mono text-sm font-semibold text-indigo-900 mt-1">
                  {formatPrice(l.product.price)}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center border border-ink/15 rounded-md">
                    <button
                      onClick={() => setQty(l.productId, l.qty - 1)}
                      className="w-8 h-8 text-ink/60 hover:bg-sand"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm">{l.qty}</span>
                    <button
                      onClick={() => setQty(l.productId, Math.min(l.product.stock, l.qty + 1))}
                      className="w-8 h-8 text-ink/60 hover:bg-sand"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(l.productId)}
                    className="text-xs text-coral-600 font-medium hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-ink/10 rounded-lg p-5 h-fit sticky top-20">
        <h2 className="font-display font-semibold mb-4">Order summary</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-ink/60">Subtotal</span>
            <span className="font-mono">{formatPrice(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/60">Delivery</span>
            <span className="font-mono">{formatPrice(delivery)}</span>
          </div>
          <div className="flex justify-between font-semibold text-base pt-2 border-t border-ink/10">
            <span>Total</span>
            <span className="font-mono">{formatPrice(total)}</span>
          </div>
        </div>
        <button
          onClick={handleCheckout}
          className="w-full mt-5 bg-mango hover:bg-mango-400 text-indigo-950 font-semibold py-2.5 rounded-md"
        >
          Proceed to checkout
        </button>
      </div>
    </div>
  );
}
