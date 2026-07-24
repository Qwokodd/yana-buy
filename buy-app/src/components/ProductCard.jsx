import { Link } from "react-router-dom";
import ProductThumb from "./ProductThumb";
import RatingStars from "./RatingStars";
import ChinaBadge from "./ChinaBadge";
import { formatPrice } from "../utils/storage";

export default function ProductCard({ product }) {
  const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;
  const pct = hasDiscount
    ? Math.round(100 - (product.price / product.compareAtPrice) * 100)
    : 0;

  return (
    <Link
      to={`/product/${product.id}`}
      className="group block bg-white border border-ink/10 rounded-lg overflow-hidden hover:border-teal/50 hover:shadow-lg hover:shadow-indigo-950/5 transition-all"
    >
      <div className="relative aspect-square">
        <ProductThumb product={product} className="w-full h-full" />
        {hasDiscount && (
          <div className="absolute top-2 left-0 tag-notch tag-hole bg-coral text-white text-xs font-mono font-semibold pl-2 pr-4 py-1">
            -{pct}%
          </div>
        )}
        {product.stock === 0 && (
          <div className="absolute inset-0 bg-ink/60 flex items-center justify-center">
            <span className="text-white font-display text-sm px-3 py-1 border border-white/40 rounded-full">
              Out of stock
            </span>
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-body font-medium text-sm text-ink leading-snug line-clamp-2 min-h-[2.5rem] group-hover:text-teal-600 transition-colors">
          {product.title}
        </h3>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="font-mono font-semibold text-indigo-900">
            {formatPrice(product.price)}
          </span>
          {hasDiscount && (
            <span className="font-mono text-xs text-ink/40 line-through">
              {formatPrice(product.compareAtPrice)}
            </span>
          )}
        </div>
        <div className="mt-1">
          <RatingStars rating={product.rating} reviews={product.reviews} size="text-xs" />
        </div>
        {product.shipsFromChina && (
          <div className="mt-1.5">
            <ChinaBadge days={product.chinaDeliveryDays} />
          </div>
        )}
      </div>
    </Link>
  );
}
