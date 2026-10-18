import Link from "next/link";
import { formatLD, type ProductCard as Card } from "@yanabuy/shared";
import { RatingLine } from "./Reviews";
import { HeartButton } from "./Heart";

/** How much cheaper than the old price, e.g. "-25%". */
export function discount(price: number, compareAt: number | null) {
  if (!compareAt || compareAt <= price) return null;
  return Math.round((1 - price / compareAt) * 100);
}

export function ProductCard({ product: p }: { product: Card }) {
  const off = discount(p.price, p.compareAtPrice);
  return (
    <Link href={`/p/${p.id}`} className="group flex flex-col overflow-hidden rounded-card border border-line bg-white transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(46,20,64,0.08)]">
      <div className="relative aspect-square bg-ground">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">No photo</div>
        )}
        {off && <span className="absolute left-2.5 top-2.5 rounded-full bg-price px-2 py-0.5 text-[11.5px] font-extrabold text-white">-{off}%</span>}
        {p.shipsFromChina && (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-ink shadow-sm">
            🇨🇳 {p.deliveryDays ? `~${p.deliveryDays} days` : "From China"}
          </span>
        )}
        <span className="absolute bottom-2.5 right-2.5 z-[1]">
          <HeartButton productId={p.id} name={p.name} />
        </span>
        {!p.inStock && (
          <span className="absolute inset-x-0 bottom-0 bg-ink/75 py-1.5 text-center text-[12px] font-bold text-white">Sold out</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-ink group-hover:text-purple">{p.name}</p>
        <RatingLine rating={p.rating} count={p.ratingCount} className="text-[12px]" />
        <p className="mt-auto flex items-baseline gap-1.5 pt-1">
          <span className="font-display text-[17px] font-extrabold text-price">
            {p.hasOptions && <span className="mr-1 text-[12px] font-semibold text-muted">from</span>}
            {formatLD(p.price)}
          </span>
          {p.compareAtPrice && off && <span className="text-[12px] text-muted line-through">{formatLD(p.compareAtPrice)}</span>}
        </p>
        <p className="truncate text-[12px] text-muted">
          {p.shop.name} · {p.shop.city}
        </p>
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: Card[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-card border border-line bg-white">
          <div className="aspect-square animate-pulse bg-ground" />
          <div className="flex flex-col gap-2 p-3.5">
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-ground" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-ground" />
          </div>
        </div>
      ))}
    </div>
  );
}
