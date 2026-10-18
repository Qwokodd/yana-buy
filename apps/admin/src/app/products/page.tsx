"use client";

import { AdminShell } from "@/components/AdminShell";
import { ProductsBrowser } from "@/components/ProductReview";

export default function ProductsPage() {
  return (
    <AdminShell title="Products" subtitle="Everything sellers list. Feature the best on the home page, or remove anything that breaks the rules.">
      <ProductsBrowser />
    </AdminShell>
  );
}
