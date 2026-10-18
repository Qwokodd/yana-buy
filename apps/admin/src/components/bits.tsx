"use client";

import type { ReactNode } from "react";
import type { ShopStatus } from "@yanabuy/shared";
import { Badge, Button } from "@yanabuy/web-kit";

export function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          aria-pressed={value === t.value}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold ${
            value === t.value ? "bg-purple text-white" : "border border-line-strong bg-white text-soft hover:text-ink"
          }`}
        >
          {t.label}
          {t.count ? (
            <span className={`rounded-full px-1.5 text-[11px] ${value === t.value ? "bg-white/20" : "bg-amber text-ink"}`}>{t.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  onSubmit,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  label: string;
}) {
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="ml-auto flex gap-2"
    >
      <label className="flex h-10 w-72 items-center gap-2 rounded-full border border-line-strong bg-white px-4">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="#6B6275" strokeWidth="2" />
          <path d="m20 20-3.5-3.5" stroke="#6B6275" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="sr-only">{label}</span>
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="flex-1 bg-transparent text-sm outline-none" />
      </label>
      <Button type="submit" size="sm">
        Search
      </Button>
    </form>
  );
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-4 border-t border-line px-4 py-3 text-[13px]">
      <button disabled={page === 1} onClick={() => onPage(page - 1)} className="font-bold text-purple disabled:opacity-40">
        ← Previous
      </button>
      <span className="text-muted">
        Page {page} of {pages}
      </span>
      <button disabled={page === pages} onClick={() => onPage(page + 1)} className="font-bold text-purple disabled:opacity-40">
        Next →
      </button>
    </div>
  );
}

const SHOP_TONE: Record<ShopStatus, "warn" | "success" | "danger" | "neutral"> = {
  pending: "warn",
  approved: "success",
  rejected: "neutral",
  suspended: "danger",
};
const SHOP_WORD: Record<ShopStatus, string> = {
  pending: "Waiting",
  approved: "Approved",
  rejected: "Sent back",
  suspended: "Suspended",
};

export function ShopStatusBadge({ status }: { status: ShopStatus }) {
  return <Badge tone={SHOP_TONE[status]}>{SHOP_WORD[status]}</Badge>;
}

/** A square tile: the uploaded image, or the first letters of the name. */
export function Tile({ name, url, size = 40, rounded = "rounded-xl" }: { name: string; url?: string | null; size?: number; rounded?: string }) {
  const letters = name
    .split(/\s+/)
    .filter((w) => /^[\p{L}\p{N}]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={`flex-shrink-0 object-cover ${rounded} border border-line`} style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden="true"
      className={`flex flex-shrink-0 items-center justify-center bg-purple-tint font-display font-extrabold text-purple ${rounded}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {letters || "?"}
    </span>
  );
}

export function EmptyPanel({ children }: { children: ReactNode }) {
  return <div className="rounded-[20px] border border-dashed border-line-strong bg-white/60 p-8 text-center text-sm text-muted">{children}</div>;
}

/** Small up/down buttons for reordering a list. */
export function MoveButtons({ onUp, onDown, name, disabled }: { onUp?: () => void; onDown?: () => void; name: string; disabled?: boolean }) {
  const cls = "flex h-7 w-7 items-center justify-center rounded-lg border border-line-strong bg-white text-soft hover:text-purple disabled:opacity-30";
  return (
    <span className="flex gap-1">
      <button type="button" className={cls} onClick={onUp} disabled={disabled || !onUp} aria-label={`Move ${name} up`}>
        ↑
      </button>
      <button type="button" className={cls} onClick={onDown} disabled={disabled || !onDown} aria-label={`Move ${name} down`}>
        ↓
      </button>
    </span>
  );
}

/** Five stars, filled up to `value` (read-only). */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-px" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"
            fill={i <= Math.round(value) ? "rgb(var(--c-amber))" : "#E4DEEA"}
          />
        </svg>
      ))}
    </span>
  );
}

/** A row of photos that open full size in a new tab. */
export function PhotoRow({ urls, size = 88 }: { urls: string[]; size?: number }) {
  if (!urls.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((u, i) => (
        <a key={u + i} href={u} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-line hover:ring-2 hover:ring-purple/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt={`Photo ${i + 1}`} style={{ width: size, height: size }} className="object-cover" />
        </a>
      ))}
    </div>
  );
}
