import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useData } from "../../context/DataContext";
import DashboardShell from "../../components/DashboardShell";
import Badge from "../../components/Badge";
import { formatPrice } from "../../utils/storage";

const LINKS = [
  { to: "/account", label: "Profile", end: true },
  { to: "/account/orders", label: "My orders" },
  { to: "/account/food-orders", label: "My food orders" },
];

export default function Orders() {
  const { currentUser } = useAuth();
  const { orders } = useData();
  const myOrders = orders.filter((o) => o.customerId === currentUser.id);

  return (
    <DashboardShell title="My account" subtitle={currentUser.email} links={LINKS}>
      <h2 className="font-display font-semibold mb-4">Order history ({myOrders.length})</h2>
      {myOrders.length === 0 ? (
        <div className="bg-white border border-ink/10 rounded-lg p-8 text-center text-ink/50">
          No orders yet.{" "}
          <Link to="/" className="text-teal-600 font-medium">Start shopping</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {myOrders.map((o) => (
            <div key={o.id} className="bg-white border border-ink/10 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-mono text-sm font-semibold">#{o.id.slice(-6).toUpperCase()}</p>
                  <p className="text-xs text-ink/50">{new Date(o.createdAt).toLocaleString()}</p>
                </div>
                <Badge status={o.status} />
              </div>
              <ul className="text-sm text-ink/70 space-y-1">
                {o.items.map((i) => (
                  <li key={i.productId} className="flex justify-between">
                    <span>{i.qty}× {i.title}</span>
                    <span className="font-mono">{formatPrice(i.price * i.qty)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between font-semibold text-sm mt-2 pt-2 border-t border-ink/10">
                <span>Total</span>
                <span className="font-mono">{formatPrice(o.total)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
