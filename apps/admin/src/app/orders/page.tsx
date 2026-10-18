"use client";

import { AdminShell } from "@/components/AdminShell";
import { OrdersBrowser } from "@/components/Orders";

export default function OrdersPage() {
  return (
    <AdminShell title="Orders" subtitle="Every order on YanaBuy. Open one to see the items, the addresses, the rider and every step.">
      <OrdersBrowser />
    </AdminShell>
  );
}
