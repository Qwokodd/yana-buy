"use client";

import { useWishlist } from "@/lib/wishlist";

/** Save / unsave a product. Stops the click from opening the product card it sits on. */
export function HeartButton({ productId, name, size = "sm" }: { productId: string; name: string; size?: "sm" | "lg" }) {
  const wish = useWishlist();
  const on = wish.has(productId);
  const box = size === "lg" ? "h-11 w-11" : "h-9 w-9";
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from your wishlist` : `Save ${name} to your wishlist`}
      title={on ? "Saved" : "Save for later"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void wish.toggle(productId);
      }}
      className={`${box} flex items-center justify-center rounded-full bg-white/95 shadow-sm ring-1 ring-line transition hover:scale-105`}
    >
      <svg viewBox="0 0 24 24" width={size === "lg" ? 22 : 18} height={size === "lg" ? 22 : 18} aria-hidden="true">
        <path
          d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2 0 3.3 1.1 5 3 1.7-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"
          fill={on ? "#C8102E" : "none"}
          stroke={on ? "#C8102E" : "#4E4459"}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
