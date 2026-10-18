"use client";

import { AdminShell } from "@/components/AdminShell";
import { ShopsBrowser } from "@/components/ShopReview";

export default function VendorsPage() {
  return (
    <AdminShell title="Vendors" subtitle="Every shop and restaurant. Suspend one that breaks the rules, or reinstate it.">
      <ShopsBrowser />
    </AdminShell>
  );
}
