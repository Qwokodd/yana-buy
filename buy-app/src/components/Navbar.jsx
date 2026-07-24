import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useFoodCart } from "../context/FoodCartContext";
import { useData } from "../context/DataContext";
import { imageUrl } from "../utils/upload";
import StoreLogo from "./StoreLogo";

export default function Navbar() {
  const { currentUser, logout } = useAuth();
  const { count } = useCart();
  const { categories } = useData();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);

  function submitSearch(e) {
    e.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <header className="sticky top-0 z-40 bg-grad-indigo text-white shadow-lift">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center gap-4 h-16">
          <Link to="/" className="font-display text-2xl font-bold tracking-tight shrink-0">
            Yana Buy<span className="text-mango">.</span>
          </Link>

          <div className="relative hidden md:block">
            <button
              onClick={() => setCatOpen((v) => !v)}
              onBlur={() => setTimeout(() => setCatOpen(false), 150)}
              className="flex items-center gap-1 text-sm font-medium px-3 py-2 rounded-md hover:bg-white/10"
            >
              Categories ▾
            </button>
            {catOpen && (
              <div className="absolute top-full left-0 mt-2 w-56 bg-white text-ink rounded-xl shadow-lift ring-1 ring-ink/[0.06] overflow-hidden py-1">
                {categories.map((c) => (
                  <Link
                    key={c.id}
                    to={`/category/${c.id}`}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-sand transition-colors"
                  >
                    <StoreLogo image={c.iconImage} emoji={c.icon} color={c.color} sizeClass="w-6 h-6" textSizeClass="text-sm" />
                    {c.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={submitSearch} className="flex-1 max-w-xl">
            <div className="flex bg-white rounded-md overflow-hidden">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products, brands and stores"
                className="flex-1 px-3 py-2 text-sm text-ink outline-none min-w-0"
              />
              <button
                type="submit"
                className="bg-mango text-indigo-950 font-semibold px-4 text-sm hover:bg-mango-400"
              >
                Search
              </button>
            </div>
          </form>

          <Link
            to="/sourcing"
            className="hidden lg:inline-block text-sm font-medium px-3 py-2 rounded-md hover:bg-white/10 whitespace-nowrap"
          >
            🇨🇳 Ship from China
          </Link>

          <Link
            to="/sell"
            className="hidden lg:inline-block text-sm font-medium px-3 py-2 rounded-md hover:bg-white/10 whitespace-nowrap"
          >
            Sell on Yana Buy
          </Link>

          <Link to="/food/cart" className="relative px-2 py-2 rounded-md hover:bg-white/10 hidden sm:block" aria-label="Food cart">
            <FoodCartBadge />
          </Link>

          <Link to="/cart" className="relative px-2 py-2 rounded-md hover:bg-white/10" aria-label="Cart">
            <CartIcon />
            {count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-coral text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {count}
              </span>
            )}
          </Link>

          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
              className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-white/10 text-sm"
            >
              <span className="w-7 h-7 rounded-full bg-teal flex items-center justify-center text-xs font-semibold overflow-hidden shrink-0">
                {currentUser?.avatarImage ? (
                  <img src={imageUrl(currentUser.avatarImage)} alt="" className="w-full h-full object-cover" />
                ) : currentUser ? (
                  currentUser.name.slice(0, 1).toUpperCase()
                ) : (
                  "?"
                )}
              </span>
              <span className="hidden sm:inline">
                {currentUser ? currentUser.name.split(" ")[0] : "Account"}
              </span>
              ▾
            </button>
            {menuOpen && (
              <div className="absolute top-full right-0 mt-1 w-52 bg-white text-ink rounded-md shadow-xl overflow-hidden py-1">
                {!currentUser && (
                  <>
                    <Link to="/login" className="block px-3 py-2 text-sm hover:bg-sand">
                      Log in
                    </Link>
                    <Link to="/signup" className="block px-3 py-2 text-sm hover:bg-sand">
                      Create account
                    </Link>
                  </>
                )}
                {currentUser?.role === "customer" && (
                  <>
                    <Link to="/account" className="block px-3 py-2 text-sm hover:bg-sand">
                      My profile
                    </Link>
                    <Link to="/account/orders" className="block px-3 py-2 text-sm hover:bg-sand">
                      My orders
                    </Link>
                    <Link to="/account/food-orders" className="block px-3 py-2 text-sm hover:bg-sand">
                      My food orders
                    </Link>
                    <Link to="/sourcing" className="block px-3 py-2 text-sm hover:bg-sand">
                      China sourcing requests
                    </Link>
                  </>
                )}
                {currentUser?.role === "vendor" && (
                  <Link to="/vendor" className="block px-3 py-2 text-sm hover:bg-sand">
                    Vendor dashboard
                  </Link>
                )}
                {currentUser && (
                  <button
                    onClick={() => {
                      logout();
                      navigate("/");
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-sand text-coral-600"
                  >
                    Log out
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function CartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function FoodCartBadge() {
  const { count } = useFoodCart();
  return (
    <span className="relative inline-block">
      <span className="text-lg">🍲</span>
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 bg-coral text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
          {count}
        </span>
      )}
    </span>
  );
}
