import Link from "next/link";
import { SHOP_KIND_LABEL, type PublicShop } from "@yanabuy/shared";

export function ShopLogo({ name, url, size = 48 }: { name: string; url: string | null; size?: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="flex-shrink-0 rounded-2xl border border-line bg-white object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden="true"
      className="flex flex-shrink-0 items-center justify-center rounded-2xl bg-purple-tint font-display font-extrabold text-purple"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name[0]?.toUpperCase()}
    </span>
  );
}

export function ShopTile({ shop }: { shop: PublicShop }) {
  return (
    <Link href={`/shop/${shop.slug}`} className="flex items-center gap-3 rounded-card border border-line bg-white p-3.5 hover:border-purple">
      <ShopLogo name={shop.name} url={shop.logoUrl} />
      <span className="min-w-0">
        <span className="block truncate font-bold">{shop.name}</span>
        <span className="text-[12.5px] text-muted">
          {SHOP_KIND_LABEL[shop.kind]} · {shop.city} · {shop.productCount} {shop.productCount === 1 ? "item" : "items"}
        </span>
      </span>
    </Link>
  );
}

/** A bigger card for the shop directory: cover, logo, category, address, rating. */
export function ShopCard({ shop }: { shop: PublicShop }) {
  const food = shop.kind === "restaurant";
  return (
    <Link href={`/shop/${shop.slug}`} className="group flex flex-col overflow-hidden rounded-card border border-line bg-white hover:border-purple">
      <div className={`relative h-[110px] ${food ? "bg-orange/15" : "bg-amber/20"}`}>
        {shop.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shop.coverUrl} alt="" className="h-full w-full object-cover" />
        )}
        <span className="absolute right-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[12px] font-extrabold text-ink shadow-sm">
          {shop.rating ? (
            <>
              <span className="text-amber">★</span> {shop.rating.toFixed(1)} <span className="font-semibold text-muted">({shop.ratingCount})</span>
            </>
          ) : (
            "New"
          )}
        </span>
        <div className="absolute -bottom-6 left-4 rounded-[18px] bg-white p-1 shadow-sm">
          <ShopLogo name={shop.name} url={shop.logoUrl} size={52} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-4 pb-4 pt-8">
        <span className="truncate font-bold group-hover:text-purple">{shop.name}</span>
        <span className="text-[12.5px] font-semibold text-soft">
          {shop.category?.name ?? SHOP_KIND_LABEL[shop.kind]}
        </span>
        <span className="line-clamp-2 text-[12.5px] text-muted">📍 {[shop.address, shop.city].filter((v, i, a) => v && a.indexOf(v) === i).join(", ")}</span>
        <span className="mt-auto pt-1 text-[12.5px] text-muted">
          {shop.productCount} {food ? (shop.productCount === 1 ? "dish" : "dishes") : shop.productCount === 1 ? "item" : "items"}
          {shop.hours ? ` · ${shop.hours}` : ""}
        </span>
      </div>
    </Link>
  );
}
