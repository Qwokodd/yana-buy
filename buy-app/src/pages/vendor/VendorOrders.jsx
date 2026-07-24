import { useAuth } from "../../context/AuthContext";
import { useData } from "../../context/DataContext";
import DashboardShell from "../../components/DashboardShell";
import Badge from "../../components/Badge";
import { VENDOR_LINKS } from "./VendorDashboard";
import { formatPrice } from "../../utils/storage";

export default function VendorOrders() {
  const { currentUser } = useAuth();
  const { storeForOwner, orders } = useData();
  const store = storeForOwner(currentUser.id);
  const myOrders = store ? orders.filter((o) => o.items.some((i) => i.storeId === store.id)) : [];

  return (
    <DashboardShell title="Vendor dashboard" subtitle={store?.name || currentUser.email} links={VENDOR_LINKS}>
      <h2 className="font-display font-semibold mb-4">Orders ({myOrders.length})</h2>
      {myOrders.length === 0 ? (
        <div className="bg-white border border-ink/10 rounded-lg p-8 text-center text-ink/50">
          No orders for your store yet.
        </div>
      ) : (
        <div className="space-y-3">
          {myOrders.map((o) => {
            const myItems = o.items.filter((i) => i.storeId === store.id);
            const myTotal = myItems.reduce((s, i) => s + i.price * i.qty, 0);
            const mySplit = o.commissionBreakdown?.find((b) => b.storeId === store.id);
            return (
              <div key={o.id} className="bg-white border border-ink/10 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-mono text-sm font-semibold">#{o.id.slice(-6).toUpperCase()}</p>
                  <Badge status={o.status} />
                </div>
                <ul className="text-sm text-ink/70 space-y-1">
                  {myItems.map((i) => (
                    <li key={i.productId} className="flex justify-between">
                      <span>{i.qty}× {i.title}</span>
                      <span className="font-mono">{formatPrice(i.price * i.qty)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between text-sm mt-2 pt-2 border-t border-ink/10">
                  <span className="text-ink/60">Sale total</span>
                  <span className="font-mono">{formatPrice(myTotal)}</span>
                </div>
                {mySplit && (
                  <>
                    <div className="flex justify-between text-xs text-coral-600">
                      <span>Yana Buy commission (10%)</span>
                      <span className="font-mono">−{formatPrice(mySplit.commission)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-sm pt-1">
                      <span>Your earnings</span>
                      <span className="font-mono">{formatPrice(mySplit.earnings)}</span>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </DashboardShell>
  );
}
