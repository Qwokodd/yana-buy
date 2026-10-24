"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar, Logo, useAuth, useBranding } from "@yanabuy/web-kit";
import { useMode } from "@/lib/mode";
import { useCart } from "@/lib/cart";
import { CountrySelect } from "@/components/CountrySelect";
import { workspaceTitle } from "@/lib/workspace";
import { api } from "@/lib/api";
import { FOOD_HOW } from "@/components/FoodHowPicker";

export function SiteHeader() {
  const { user } = useAuth();
  const { branding } = useBranding();
  const { count } = useCart();
  const { mode, switchMode, foodHow, askFoodHow } = useMode();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [unread, setUnread] = useState(0);
  const [alerts, setAlerts] = useState(0);

  // Unread messages, checked every 30 seconds while logged in.
  useEffect(() => {
    if (!user) return setUnread(0);
    const check = () => {
      api.chats
        .unread()
        .then((r) => setUnread(r.count))
        .catch(() => {});
      api.me
        .unread()
        .then((r) => setAlerts(r.unread))
        .catch(() => {});
    };
    check();
    const t = setInterval(check, 30000);
    window.addEventListener("yanabuy:read", check);
    window.addEventListener("yb:notifications", check);
    return () => {
      clearInterval(t);
      window.removeEventListener("yanabuy:read", check);
      window.removeEventListener("yb:notifications", check);
    };
  }, [user]);

  // On the search page, show what was searched for.
  useEffect(() => {
    if (window.location.pathname === "/search") setQ(new URLSearchParams(window.location.search).get("q") ?? "");
  }, []);
  const accent = mode === "goods" ? "bg-amber text-ink" : "bg-orange text-ink";

  return (
    <header className="bg-purple">
      <div className="mx-auto flex h-[78px] max-w-[1312px] items-center gap-4 px-4 sm:px-8 xl:gap-6">
        <Link href="/" aria-label={`${branding.appName} home`} className="flex-shrink-0 text-[18px]">
          <Logo size={32} />
        </Link>

        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const term = q.trim();
            if (!term) return;
            router.push(`/search?q=${encodeURIComponent(term)}&mode=${mode}`);
            // Already on the search page: tell it about the new words.
            window.dispatchEvent(new CustomEvent("yanabuy:search", { detail: { q: term } }));
          }}
          className="hidden min-w-0 max-w-[560px] flex-1 md:block"
        >
          <label className="flex h-12 items-center gap-2.5 rounded-full bg-white pl-[18px] pr-1.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="#6B6275" strokeWidth="2" />
              <path d="m20 20-3.5-3.5" stroke="#6B6275" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="sr-only">Search</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={mode === "goods" ? "Search goods, services or shops" : "Search dishes or restaurants"}
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
            />
            <button type="submit" className={`h-[38px] rounded-full px-[18px] text-sm font-bold ${accent}`}>
              Search
            </button>
          </label>
        </form>

        <div className="hidden rounded-full bg-white/10 p-1 lg:flex" role="group" aria-label="Shopping mode">
          {(["goods", "food"] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              aria-pressed={mode === m}
              className={`h-[38px] whitespace-nowrap rounded-full px-4 text-sm font-bold transition xl:px-5 ${
                mode === m ? (m === "goods" ? "bg-amber text-ink" : "bg-orange text-ink") : "text-white"
              }`}
            >
              {m === "goods" ? "Goods & Services" : "Food"}
            </button>
          ))}
        </div>

        {mode === "food" && (
          <button
            type="button"
            onClick={askFoodHow}
            className="flex h-10 flex-shrink-0 items-center gap-1.5 rounded-full bg-orange px-3.5 text-[13px] font-bold text-ink hover:brightness-95"
            aria-label={`Food: ${FOOD_HOW.find((o) => o.value === foodHow)?.title}. Change`}
          >
            <span aria-hidden>{FOOD_HOW.find((o) => o.value === foodHow)?.icon}</span>
            <span className="hidden sm:inline">{FOOD_HOW.find((o) => o.value === foodHow)?.title}</span>
            <span aria-hidden>▾</span>
          </button>
        )}

        {user?.role === "vendor" && <SellerMenu />}

        <div className="ml-auto flex flex-shrink-0 items-center gap-3">
          <CountrySelect />
          <Link href="/shops" className="hidden text-sm font-bold text-white hover:text-amber sm:block">
            {mode === "food" ? "Restaurants" : "Shops"}
          </Link>
          {user?.role === "rider" ? (
            <Link href="/rider" className="hidden whitespace-nowrap text-sm font-bold text-white hover:text-amber sm:block">
              My deliveries
            </Link>
          ) : user?.role === "vendor" ? null : (
            <Link href="/sell" className="hidden whitespace-nowrap text-sm font-bold text-white hover:text-amber xl:block">
              Sell on {branding.appName}
            </Link>
          )}
          {user && user.role !== "vendor" && (
            <Link href="/orders" className="hidden text-sm font-bold text-white hover:text-amber md:block">
              My orders
            </Link>
          )}
          {user && (
            <Link
              href="/messages"
              aria-label={unread ? `Messages, ${unread} unread` : "Messages"}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/10"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 5h16v11H8l-4 4V5z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
              </svg>
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber px-1 text-[11px] font-extrabold text-ink">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          )}
          {user && (
            <Link href="/wishlist" aria-label="Your wishlist" className="hidden h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/10 sm:flex">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2 0 3.3 1.1 5 3 1.7-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
              </svg>
            </Link>
          )}
          {user && (
            <Link
              href="/notifications"
              aria-label={alerts ? `Notifications, ${alerts} new` : "Notifications"}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/10"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
                <path d="M10 20.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
              {alerts > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber px-1 text-[11px] font-extrabold text-ink">
                  {alerts > 99 ? "99+" : alerts}
                </span>
              )}
            </Link>
          )}
          <Link href="/cart" aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`} className="relative flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/10">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 5h2l1.6 9.6a2 2 0 0 0 2 1.7h7.6a2 2 0 0 0 2-1.6L20.5 8H6.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <circle cx="10" cy="20" r="1.4" fill="currentColor" />
              <circle cx="17" cy="20" r="1.4" fill="currentColor" />
            </svg>
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber px-1 text-[11px] font-extrabold text-ink">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Link>
          {user ? (
            <Link href="/account" aria-label="Your account" className="rounded-full ring-2 ring-amber">
              <Avatar name={user.fullName} url={user.avatarUrl} size={40} />
            </Link>
          ) : (
            <Link href="/login" className="whitespace-nowrap rounded-full bg-white px-5 py-2.5 text-sm font-bold text-purple hover:bg-amber hover:text-ink">
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/** Sellers: everything for running the shop / restaurant in one menu by the search bar. */
function SellerMenu() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const food = user?.myShop?.kind === "restaurant";
  const links: { href: string; label: string }[] = [
    { href: "/sell", label: workspaceTitle(user) },
    { href: "/sell/orders", label: food ? "Restaurant orders" : "Shop orders" },
    { href: "/sell/products", label: food ? "My menu" : "My products" },
    { href: "/sell/bookings", label: food ? "Table bookings" : "Appointments" },
    { href: "/sell/earnings", label: "Earnings" },
    { href: "/sell/reviews", label: "Reviews" },
    { href: "/sell/profile", label: food ? "Restaurant profile" : "Shop profile" },
    ...(user?.myShop ? [{ href: `/shop/${user.myShop.slug}`, label: food ? "View my restaurant page" : "View my storefront" }] : []),
    { href: "/orders", label: "My purchases" },
  ];
  return (
    <div ref={box} className="relative flex-shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/20"
      >
        <span className="whitespace-nowrap">{workspaceTitle(user)}</span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-12 z-40 flex w-60 flex-col rounded-2xl border border-line bg-white p-1.5 shadow-xl">
          {links.map((l) => (
            <Link key={l.href} role="menuitem" href={l.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-ink hover:bg-purple-tint">
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
