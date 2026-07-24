import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useData } from "../context/DataContext";
import { useAuth } from "../context/AuthContext";
import PaymentForm from "../components/PaymentForm";
import { formatPrice } from "../utils/storage";

export default function Checkout() {
  const { items, clear } = useCart();
  const { products, createOrder } = useData();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [address, setAddress] = useState({
    fullName: currentUser?.name || "",
    phone: currentUser?.phone || "",
    address: "",
    city: "",
  });
  const [addressConfirmed, setAddressConfirmed] = useState(false);

  const lines = items
    .map((i) => ({ ...i, product: products.find((p) => p.id === i.productId) }))
    .filter((l) => l.product);
  const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0);
  const delivery = subtotal > 0 ? 20 : 0;
  const total = subtotal + delivery;

  if (lines.length === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <p className="text-ink/60 mb-4">Your cart is empty.</p>
        <Link to="/" className="text-teal-600 font-medium">Continue shopping</Link>
      </div>
    );
  }

  function confirmAddress(e) {
    e.preventDefault();
    setAddressConfirmed(true);
  }

  function handlePaymentSuccess(payment) {
    const order = createOrder({
      customerId: currentUser.id,
      items: lines.map((l) => ({
        productId: l.product.id,
        title: l.product.title,
        qty: l.qty,
        price: l.product.price,
        storeId: l.product.storeId || null,
        sellerType: l.product.sellerType,
      })),
      subtotal,
      delivery,
      total,
      shippingAddress: address,
      payment,
      status: "paid",
    });
    clear();
    navigate(`/order/${order.id}/success`);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 grid md:grid-cols-[1fr_320px] gap-8">
      <div className="space-y-6">
        <div className="bg-white border border-ink/10 rounded-lg p-5">
          <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-indigo-950 text-white text-xs flex items-center justify-center">1</span>
            Delivery address
          </h2>
          {!addressConfirmed ? (
            <form onSubmit={confirmAddress} className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  required
                  placeholder="Full name"
                  value={address.fullName}
                  onChange={(e) => setAddress((a) => ({ ...a, fullName: e.target.value }))}
                  className="border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
                />
                <input
                  required
                  placeholder="Phone number"
                  value={address.phone}
                  onChange={(e) => setAddress((a) => ({ ...a, phone: e.target.value }))}
                  className="border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
                />
              </div>
              <input
                required
                placeholder="Street address"
                value={address.address}
                onChange={(e) => setAddress((a) => ({ ...a, address: e.target.value }))}
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
              />
              <input
                required
                placeholder="City / town"
                value={address.city}
                onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
              />
              <button
                type="submit"
                className="bg-indigo-950 hover:bg-indigo-900 text-white font-semibold px-5 py-2.5 rounded-md text-sm"
              >
                Continue to payment
              </button>
            </form>
          ) : (
            <div className="flex items-start justify-between text-sm">
              <div>
                <p className="font-medium">{address.fullName} · {address.phone}</p>
                <p className="text-ink/60">{address.address}, {address.city}</p>
              </div>
              <button
                onClick={() => setAddressConfirmed(false)}
                className="text-teal-600 text-xs font-medium hover:underline"
              >
                Edit
              </button>
            </div>
          )}
        </div>

        <div className={`bg-white border border-ink/10 rounded-lg p-5 ${!addressConfirmed ? "opacity-50 pointer-events-none" : ""}`}>
          <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-indigo-950 text-white text-xs flex items-center justify-center">2</span>
            Payment
          </h2>
          <PaymentForm
            amountLabel={formatPrice(total)}
            disabled={!addressConfirmed}
            onSuccess={handlePaymentSuccess}
          />
        </div>
      </div>

      <div className="bg-white border border-ink/10 rounded-lg p-5 h-fit sticky top-20">
        <h2 className="font-display font-semibold mb-4">Order summary</h2>
        <ul className="space-y-2 mb-3 max-h-64 overflow-y-auto">
          {lines.map((l) => (
            <li key={l.productId} className="flex justify-between text-xs">
              <span className="text-ink/70 line-clamp-1 pr-2">{l.qty}× {l.product.title}</span>
              <span className="font-mono shrink-0">{formatPrice(l.product.price * l.qty)}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-2 text-sm border-t border-ink/10 pt-3">
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
      </div>
    </div>
  );
}
