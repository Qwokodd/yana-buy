import { useParams, Link } from "react-router-dom";
import { useData } from "../../context/DataContext";
import { formatPrice } from "../../utils/storage";

export default function FoodOrderSuccess() {
  const { id } = useParams();
  const { foodOrders, restaurants } = useData();
  const order = foodOrders.find((o) => o.id === id);
  const restaurant = order ? restaurants.find((r) => r.id === order.restaurantId) : null;

  if (!order) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <p className="text-ink/60">We couldn't find that order.</p>
        <Link to="/food" className="text-teal-600 font-medium">Back to restaurants</Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="text-6xl mb-4">🍲</div>
      <h1 className="font-display text-2xl font-semibold mb-2">Order placed!</h1>
      <p className="text-sm text-ink/60 mb-6">
        Thanks, {order.deliveryAddress.fullName}. Your order{" "}
        <span className="font-mono">#{order.id.slice(-6).toUpperCase()}</span>{" "}
        {restaurant && <>from {restaurant.name} </>}
        was paid via{" "}
        {order.payment.method === "visa" ? "card" : `${order.payment.network?.toUpperCase()} Mobile Money`}{" "}
        ending {order.payment.last4}.
      </p>

      <div className="bg-white border border-ink/10 rounded-lg p-5 text-left mb-6">
        <ul className="space-y-2 mb-3">
          {order.items.map((i) => (
            <li key={i.menuItemId} className="flex justify-between text-sm">
              <span className="text-ink/70">{i.qty}× {i.name}</span>
              <span className="font-mono">{formatPrice(i.price * i.qty)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between font-semibold pt-3 border-t border-ink/10">
          <span>Total paid</span>
          <span className="font-mono">{formatPrice(order.total)}</span>
        </div>
      </div>

      <div className="flex gap-3 justify-center">
        <Link to="/account/food-orders" className="bg-indigo-950 text-white font-semibold px-5 py-2.5 rounded-md text-sm">
          View my food orders
        </Link>
        <Link to="/food" className="border border-ink/15 font-semibold px-5 py-2.5 rounded-md text-sm">
          Order more
        </Link>
      </div>
    </div>
  );
}
