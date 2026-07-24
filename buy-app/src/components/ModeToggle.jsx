import { Link, useLocation } from "react-router-dom";

// Lets a customer flip the whole app between "Shop" mode (the marketplace)
// and "Restaurant" mode (food ordering) with one tap, the way a combined
// shopping + delivery app would. Highlights whichever side matches the
// current route.
export default function ModeToggle({ size = "md" }) {
  const location = useLocation();
  const isFood = location.pathname.startsWith("/food");
  const pad = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";

  return (
    <div className="inline-flex bg-white/10 rounded-full p-1 gap-1">
      <Link
        to="/"
        className={`${pad} rounded-full font-semibold transition-colors whitespace-nowrap ${
          !isFood ? "bg-mango text-indigo-950" : "text-white/80 hover:text-white"
        }`}
      >
        🛍️ Shop
      </Link>
      <Link
        to="/food"
        className={`${pad} rounded-full font-semibold transition-colors whitespace-nowrap ${
          isFood ? "bg-mango text-indigo-950" : "text-white/80 hover:text-white"
        }`}
      >
        🍲 Restaurant
      </Link>
    </div>
  );
}
