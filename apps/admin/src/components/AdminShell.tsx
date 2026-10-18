"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { Avatar, EmailConfirm, Logo, useAuth } from "@yanabuy/web-kit";

interface NavItem {
  href: string;
  label: string;
  /** Not built yet — shown so the full plan is visible, but not clickable. */
  soon?: boolean;
  /** Shows a count of things waiting. */
  badge?: "pending" | "rider" | "payout" | "dispute" | "sourcing";
}

const NAV: { section?: string; items: NavItem[] }[] = [
  { items: [{ href: "/", label: "Overview" }, { href: "/approvals", label: "Approvals", badge: "pending" }] },
  {
    section: "Marketplace",
    items: [
      { href: "/products", label: "Products" },
      { href: "/categories", label: "Categories" },
      { href: "/orders", label: "Orders" },
      { href: "/bookings", label: "Bookings" },
      { href: "/sourcing", label: "China sourcing", badge: "sourcing" },
      { href: "/shopify", label: "Old Shopify store" },
    ],
  },
  {
    section: "People",
    items: [
      { href: "/people", label: "Buyers & accounts" },
      { href: "/vendors", label: "Vendors" },
      { href: "/riders", label: "Riders" },
      { href: "/messages", label: "Send a message" },
    ],
  },
  {
    section: "Deliveries",
    items: [
      { href: "/deliveries", label: "Assign riders", badge: "rider" },
      { href: "/delivery-settings", label: "Delivery fees" },
    ],
  },
  {
    section: "Money",
    items: [
      { href: "/payouts", label: "Payouts", badge: "payout" },
      { href: "/money", label: "Money overview" },
      { href: "/discounts", label: "Discount codes" },
    ],
  },
  {
    section: "Storefront",
    items: [
      { href: "/banners", label: "Banners & ads" },
      { href: "/branding", label: "Branding" },
    ],
  },
  {
    section: "Trust & safety",
    items: [
      { href: "/disputes", label: "Disputes", badge: "dispute" },
      { href: "/reviews", label: "Reviews" },
      { href: "/chats", label: "Chats" },
      { href: "/audit-log", label: "Audit log" },
    ],
  },
];

export function AdminShell({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  const { user, loading, logout, setUser } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [pending, setPending] = useState(0);
  const [needRider, setNeedRider] = useState(0);
  const [payoutsWaiting, setPayoutsWaiting] = useState(0);
  const [disputesOpen, setDisputesOpen] = useState(0);
  const [sourcingWaiting, setSourcingWaiting] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // How many shops and products are waiting — refreshed on every page change.
  useEffect(() => {
    if (!user) return;
    api.admin
      .stats()
      .then((s) => {
        setPending(s.shops.pending + s.products.pending + s.ridersPending);
        setNeedRider(s.orders.needRider);
        setPayoutsWaiting(s.payoutsWaiting);
        setDisputesOpen(s.disputesOpen);
        setSourcingWaiting(s.sourcingWaiting);
      })
      .catch(() => {});
  }, [user, pathname]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted">Loading…</div>;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-[248px] flex-shrink-0 flex-col overflow-y-auto bg-ink py-5">
        <div className="flex items-center gap-2 px-[22px] pb-3 text-[15px]">
          <Logo size={28} />
          <span className="text-[10px] font-bold tracking-[1.4px] text-white/55">ADMIN</span>
        </div>
        <nav aria-label="Admin" className="flex flex-col">
          {NAV.map((group, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              {group.section && (
                <p className="px-[22px] pb-0.5 pt-3 text-[10.5px] font-bold uppercase tracking-[1px] text-white/40">{group.section}</p>
              )}
              {group.items.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                if (item.soon) {
                  return (
                    <span
                      key={item.href}
                      className="mx-3 flex items-center justify-between rounded-[10px] px-2.5 py-1.5 text-[13.5px] font-semibold text-white/35"
                      title="Coming in a later update"
                    >
                      {item.label}
                      <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-white/50">Soon</span>
                    </span>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`mx-3 flex items-center justify-between rounded-[10px] px-2.5 py-1.5 text-[13.5px] font-semibold transition ${
                      active ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {item.label}
                    {(() => {
                      const n = item.badge ? { pending, rider: needRider, payout: payoutsWaiting, dispute: disputesOpen, sourcing: sourcingWaiting }[item.badge] : 0;
                      return n > 0 ? (
                        <span className="rounded-full bg-amber px-1.5 py-0.5 text-[10.5px] font-extrabold text-ink" aria-label={`${n} waiting`}>
                          {n}
                        </span>
                      ) : null;
                    })()}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2.5 border-t border-white/10 px-[22px] pt-4">
          <Avatar name={user.fullName} url={user.avatarUrl} size={34} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-white">{user.fullName}</p>
            <button
              onClick={async () => {
                await logout();
                router.replace("/login");
              }}
              className="text-xs font-semibold text-white/60 hover:text-white"
            >
              Log out
            </button>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[72px] items-center justify-between gap-4 border-b border-line bg-white px-8 py-3">
          <div>
            <h1 className="font-display text-[22px] font-extrabold">{title}</h1>
            {subtitle && <p className="text-[12.5px] text-muted">{subtitle}</p>}
          </div>
          {actions}
        </header>
        <div className="flex-1 p-8">
          {user && (!user.email || !user.emailVerified) && (
            <section className="mb-6 max-w-xl rounded-[20px] border border-amber bg-[#FFF8E8] p-5">
              <h2 className="font-display text-base font-extrabold">{user.email ? "Confirm your email" : "Add your email"} to get admin alerts</h2>
              <p className="mb-3 text-[13px] text-soft">New shops and products to approve, payout requests, problems with orders and orders that need a rider come to you by email and SMS.</p>
              <EmailConfirm api={api} user={user} onDone={setUser} />
            </section>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
