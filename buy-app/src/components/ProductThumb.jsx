import { CATEGORIES } from "../data/seed";
import { imageUrl } from "../utils/upload";

function categoryColor(categoryId) {
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  return cat?.color || "#1F2266";
}

export default function ProductThumb({ product, className = "" }) {
  const color = categoryColor(product.category);
  const photo = product.images?.[0];

  if (photo) {
    return (
      <div className={`overflow-hidden select-none ${className}`} aria-hidden="true">
        <img src={imageUrl(photo)} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center select-none ${className}`}
      style={{
        background: `linear-gradient(145deg, ${color}22, ${color}0d)`,
      }}
      aria-hidden="true"
    >
      <span style={{ fontSize: "clamp(2rem, 18%, 5rem)" }}>{product.emoji || "🛍️"}</span>
    </div>
  );
}
