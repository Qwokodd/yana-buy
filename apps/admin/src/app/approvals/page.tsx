"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { PillTabs } from "@/components/bits";
import { ProductsBrowser } from "@/components/ProductReview";
import { ShopsBrowser } from "@/components/ShopReview";
import { RiderApplicationsBrowser } from "@/components/RiderReview";
import { api } from "@/lib/api";

type Tab = "shops" | "products" | "riders";

export default function ApprovalsPage() {
  const [tab, setTab] = useState<Tab>("shops");
  const [counts, setCounts] = useState({ shops: 0, products: 0, riders: 0 });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("product") || params.get("tab") === "products") setTab("products");
    if (params.get("tab") === "riders") setTab("riders");
    api.admin
      .stats()
      .then((s) => {
        setCounts({ shops: s.shops.pending, products: s.products.pending, riders: s.ridersPending });
        // Nothing waiting for shops: open the first tab that has something.
        if (!params.get("id") && !params.get("tab") && s.shops.pending === 0) {
          if (s.products.pending > 0) setTab("products");
          else if (s.ridersPending > 0) setTab("riders");
        }
      })
      .catch(() => {});
  }, []);

  return (
    <AdminShell title="Approvals" subtitle="Everything waiting for you, oldest first.">
      <div className="mb-5">
        <PillTabs
          label="What to review"
          tabs={[
            { value: "shops", label: "Shops & restaurants", count: counts.shops },
            { value: "products", label: "Products", count: counts.products },
            { value: "riders", label: "Riders", count: counts.riders },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === "shops" ? (
        <ShopsBrowser queue />
      ) : tab === "riders" ? (
        <RiderApplicationsBrowser queue onCount={(n) => setCounts((c) => ({ ...c, riders: n }))} />
      ) : (
        <ProductsBrowser queue onCount={(n) => setCounts((c) => ({ ...c, products: n }))} />
      )}
    </AdminShell>
  );
}
