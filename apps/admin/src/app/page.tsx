"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AdminProduct, AdminShop, AdminStats, AdminUser } from "@yanabuy/shared";
import { formatLD, SHOP_KIND_LABEL } from "@yanabuy/shared";
import { Tile } from "@/components/bits";
import { formatLiberianPhone } from "@yanabuy/shared";
import { Alert, Avatar, Badge, messageOf, useAuth } from "@yanabuy/web-kit";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";
import { ROLE_LABEL, when } from "@/lib/labels";

export default function Overview() {
  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [latest, setLatest] = useState<AdminUser[]>([]);
  const [waiting, setWaiting] = useState<AdminShop[] | null>(null);
  const [waitingProducts, setWaitingProducts] = useState<AdminProduct[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.admin.stats(), api.admin.users({ page: 1 }), api.admin.shops({ status: "pending" }), api.admin.products({ status: "pending" })])
      .then(([s, u, w, wp]) => {
        setStats(s);
        setLatest(u.items.slice(0, 6));
        setWaiting(w.items.slice(0, 4));
        setWaitingProducts(wp.items.slice(0, 4));
      })
      .catch((err) => setError(messageOf(err)));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <AdminShell title={`${greeting}, ${user?.fullName.split(" ")[0] ?? "Admin"}`} subtitle="Everything across Goods, Services and Food">
      {error && <Alert>{error}</Alert>}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Buyers" value={stats?.users.buyer} note={stats ? `${stats.newThisWeek} new people this week` : ""} />
        <Stat label="Shops & restaurants" value={stats?.shops.approved} note={stats ? `${stats.shops.pending} waiting · ${stats.shops.suspended} suspended` : ""} tone={stats && stats.shops.pending > 0 ? "warn" : undefined} />
        <Stat label="Live products" value={stats?.products.approved} note={stats ? `${stats.products.pending} waiting for review` : ""} tone={stats && stats.products.pending > 0 ? "warn" : undefined} />
        <Stat label="Blocked accounts" value={stats?.blocked} note={`${stats?.users.admin ?? "–"} admins`} tone={stats && stats.blocked > 0 ? "danger" : undefined} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Orders today" value={stats?.orders.today} note={stats ? `${stats.orders.active} in progress` : ""} />
        <Stat label="Need a rider" value={stats?.orders.needRider} note="Accepted, no rider yet" tone={stats && stats.orders.needRider > 0 ? "warn" : undefined} />
        <Stat label="Delivered today" value={stats?.orders.deliveredToday} note={stats ? `${stats.users.rider} riders` : ""} />
        <StatText label="Sales today" value={stats ? formatLD(stats.orders.salesToday) : "–"} note="Delivered orders, with delivery" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Link href="/disputes" className="rounded-card hover:ring-2 hover:ring-purple/30">
          <Stat label="Open disputes" value={stats?.disputesOpen} note="Buyers reporting a problem" tone={stats && stats.disputesOpen > 0 ? "warn" : undefined} />
        </Link>
        <Link href="/sourcing" className="rounded-card hover:ring-2 hover:ring-purple/30">
          <Stat label="China requests" value={stats?.sourcingWaiting} note="To quote or to order" tone={stats && stats.sourcingWaiting > 0 ? "warn" : undefined} />
        </Link>
        <Link href="/payouts" className="rounded-card hover:ring-2 hover:ring-purple/30">
          <Stat label="Payouts waiting" value={stats?.payoutsWaiting} note="Sellers asking for money" tone={stats && stats.payoutsWaiting > 0 ? "warn" : undefined} />
        </Link>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_1fr]">
        <section className="rounded-[20px] border border-line bg-white p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-extrabold">Needs your approval</h2>
            {(!!waiting?.length || waitingProducts.length > 0 || (stats?.ridersPending ?? 0) > 0) && (
              <Link href="/approvals" className="text-[13px] font-bold text-purple hover:underline">
                Review {stats ? stats.shops.pending + stats.products.pending + stats.ridersPending : ""} waiting
              </Link>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            New shops, restaurants and products.
            {stats && stats.ridersPending > 0 && (
              <>
                {" "}
                <Link href="/approvals?tab=riders" className="font-bold text-purple hover:underline">
                  {stats.ridersPending} rider {stats.ridersPending === 1 ? "application" : "applications"} waiting →
                </Link>
              </>
            )}
          </p>
          {waiting && (waiting.length > 0 || waitingProducts.length > 0) ? (
            <ul className="mt-3 flex flex-col">
              {waiting.map((s) => (
                <li key={s.id} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
                  <Tile name={s.name} url={s.logoUrl} size={36} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/approvals?id=${s.id}`} className="block truncate text-sm font-bold hover:underline">
                      {s.name}
                    </Link>
                    <p className="text-xs text-muted">
                      {SHOP_KIND_LABEL[s.kind]} · {s.owner.fullName} · sent {when(s.submittedAt)}
                    </p>
                  </div>
                  <Badge tone="warn">Shop</Badge>
                </li>
              ))}
              {waitingProducts.map((p) => (
                <li key={p.id} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
                  <Tile name={p.name} url={p.image} size={36} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/approvals?product=${p.id}`} className="block truncate text-sm font-bold hover:underline">
                      {p.name}
                    </Link>
                    <p className="text-xs text-muted">
                      {formatLD(p.price)} · {p.shop.name} · sent {when(p.submittedAt)}
                    </p>
                  </div>
                  <Badge tone="warn">Product</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 rounded-[14px] border border-dashed border-line-strong bg-[#FBF9FC] px-4 py-8 text-center text-sm font-semibold text-muted">
              {waiting ? "Nothing waiting — you\u2019re all caught up." : "Loading…"}
            </div>
          )}
        </section>

        <section className="rounded-[20px] border border-line bg-white p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-extrabold">Newest accounts</h2>
            <Link href="/people" className="text-[13px] font-bold text-purple hover:underline">
              See everyone
            </Link>
          </div>
          <ul className="mt-3 flex flex-col">
            {latest.map((u) => (
              <li key={u.id} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
                <Avatar name={u.fullName} url={u.avatarUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <Link href={`/people?id=${u.id}`} className="block truncate text-sm font-bold hover:underline">
                    {u.fullName}
                  </Link>
                  <p className="text-xs text-muted">
                    {formatLiberianPhone(u.phone)} · joined {when(u.createdAt)}
                  </p>
                </div>
                {u.status === "blocked" ? <Badge tone="danger">Blocked</Badge> : <Badge tone={u.role === "admin" ? "purple" : "neutral"}>{ROLE_LABEL[u.role]}</Badge>}
              </li>
            ))}
            {!latest.length && !error && <li className="py-6 text-center text-sm text-muted">Loading…</li>}
          </ul>
        </section>
      </div>
    </AdminShell>
  );
}

function StatText({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-line bg-white p-[18px]">
      <span className="text-[12.5px] font-semibold text-muted">{label}</span>
      <span className="font-display text-[28px] font-extrabold">{value}</span>
      <span className="text-xs font-semibold text-muted">{note}</span>
    </div>
  );
}

function Stat({ label, value, note, tone }: { label: string; value?: number; note: string; tone?: "danger" | "warn" }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-line bg-white p-[18px]">
      <span className="text-[12.5px] font-semibold text-muted">{label}</span>
      <span className={`font-display text-[28px] font-extrabold ${tone === "danger" ? "text-danger" : ""}`}>{value ?? "–"}</span>
      <span className={`text-xs font-semibold ${tone === "warn" ? "text-warn" : "text-muted"}`}>{note}</span>
    </div>
  );
}
