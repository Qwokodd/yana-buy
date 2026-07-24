export default function RatingStars({ rating = 0, reviews, size = "text-sm" }) {
  const full = Math.round(rating);
  return (
    <div className={`flex items-center gap-1 ${size}`}>
      <span className="text-mango-600 tracking-tight" aria-hidden="true">
        {"★".repeat(full)}
        <span className="text-ink/20">{"★".repeat(5 - full)}</span>
      </span>
      {rating > 0 && (
        <span className="text-ink/50">
          {rating.toFixed(1)}
          {typeof reviews === "number" ? ` (${reviews})` : ""}
        </span>
      )}
    </div>
  );
}
