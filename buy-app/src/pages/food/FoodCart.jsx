import { Link, useNavigate } from "react-router-dom";
import { useFoodCart } from "../../context/FoodCartContext";
import { useData } from "../../context/DataContext";
import { useAuth } from "../../context/AuthContext";
import { imageUrl } from "../../utils/upload";
import { formatPrice } from "../../utils/storage";

export default function FoodCart() {
  const { items, setQty, removeItem, restaurantId } = useFoodCart();
  const { menuItems, restaurants } = useData();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const restaurant = restaurants.find((r) => r.id === restaurantId);
  const lines = items
    .map((i) => ({ ...i, item: menuItems.find((m) => m.id === i.menuItemId) }))
    .filter((l) => l.item);

  const subtotal = lines.reduce((sum, l) => sum + l.item.price * l.qty, 0);
  const delivery = subtotal > 0 ? 5 : 0;
  const total = subtotal + delivery;

  function handleCheckout() {
    if (!currentUser) {
      navigate("/login", { state: { from: "/food/checkout" } });
      return;
    }
    navigate("/food/checkout");
  }

  if (lines.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="text-5xl mb-4">🍲</div>
        <h1 className="font-display text-2xl font-semibold mb-2">Your food cart is empty</h1>
        <p className="text-sm text-ink/50 mb-6">Pick a restaurant and add something tasty.</p>
        <Link to="/food" className="inline-block bg-indigo-950 text-white font-semibold px-5 py-2.5 rounded-md">
          Browse restaurants
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 grid md:grid-cols-[1fr_320px] gap-8">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Your order</h1>
        {restaurant && <p className="text-sm text-ink/50 mb-6">from {restaurant.name}</p>}
        <div className="space-y-4">
          {lines.map((l) => (
            <div key={l.menuItemId} className="flex gap-4 bg-white border border-ink/10 rounded-lg p-3">
              <div className="w-20 h-20 rounded-md overflow-hidden shrink-0 flex items-center justify-center bg-sand text-3xl">
                {l.item.images?.[0] ? (
                  <img src={imageUrl(l.item.images[0])} alt="" className="w-full h-full object-cover" />
                ) : (
                  l.item.emoji || "🍽️"
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium line-clamp-2">{l.item.name}</p>
                <p className="font-mono text-sm font-semibold text-indigo-900 mt-1">
                  {formatPrice(l.item.price)}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center border border-ink/15 rounded-md">
                    <button onClick={() => setQty(l.menuItemId, l.qty - 1)} className="w-8 h-8 text-ink/60 hover:bg-sand">
                      −
                    </button>
                    <span className="w-8 text-center text-sm">{l.qty}</span>
                    <button onClick={() => setQty(l.menuItemId, l.qty + 1)} className="w-8 h-8 text-ink/60 hover:bg-sand">
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(l.menuItemId)}
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
