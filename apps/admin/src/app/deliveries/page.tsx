"use client";

import { AdminShell } from "@/components/AdminShell";
import { OrdersBrowser } from "@/components/Orders";

export default function DeliveriesPage() {
  return (
    <AdminShell title="Assign riders" subtitle="Orders the shops have accepted, oldest first. Give each one to a rider for pickup and delivery.">
      <OrdersBrowser board />
    </AdminShell>
  );
}
