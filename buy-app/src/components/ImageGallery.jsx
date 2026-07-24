import { useState } from "react";
import { imageUrl } from "../utils/upload";

// Simple main-image + thumbnail-strip gallery for up to 5 photos.
// Falls back to a category-tinted emoji tile when there are no uploaded
// photos yet. Owns its own aspect-square box so callers can just drop it
// in without extra wrapper markup.
export default function ImageGallery({ images = [], emoji, categoryColor = "#1F2266" }) {
  const [active, setActive] = useState(0);
  const photos = images.filter(Boolean);

  return (
    <div>
      <div className="aspect-square rounded-lg overflow-hidden border border-ink/10">
        {photos.length > 0 ? (
          <img src={imageUrl(photos[active])} alt="" className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: `linear-gradient(145deg, ${categoryColor}22, ${categoryColor}0d)` }}
          >
            <span style={{ fontSize: "clamp(2rem, 18%, 5rem)" }}>{emoji || "🛍️"}</span>
          </div>
        )}
      </div>
      {photos.length > 1 && (
        <div className="flex gap-2 mt-3">
          {photos.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setActive(i)}
              className={`w-14 h-14 rounded-md overflow-hidden border-2 shrink-0 ${
                active === i ? "border-teal" : "border-transparent opacity-70 hover:opacity-100"
              }`}
            >
              <img src={imageUrl(src)} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
