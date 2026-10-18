"use client";

import { useEffect, useState } from "react";
import type { RiderSummary } from "@yanabuy/shared";
import { Alert, messageOf } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { RiderList } from "@/components/Orders";
import { RiderApplicationsBrowser } from "@/components/RiderReview";
import { api } from "@/lib/api";

export default function RidersPage() {
  const [riders, setRiders] = useState<RiderSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.admin
      .riders()
      .then((r) => setRiders(r.items))
      .catch((err) => setError(messageOf(err)));
  }, []);
  return (
    <AdminShell title="Riders" subtitle="Your delivery team. Riders use the YanaBuy phone app: Profile → My deliveries.">
      {error && <Alert>{error}</Alert>}
      <div className="max-w-2xl">
        <RiderList riders={riders} />
        <p className="mt-3 text-[13px] text-muted">
          People apply to deliver from the website (&ldquo;Deliver with YanaBuy&rdquo;) or the app (Profile → Become a rider). New applications wait in Approvals → Riders. You can
          still make someone a rider directly in Buyers &amp; accounts.
        </p>
      </div>
      <h2 className="mb-3 mt-8 font-display text-lg font-extrabold">Rider applications</h2>
      <RiderApplicationsBrowser />
    </AdminShell>
  );
}
