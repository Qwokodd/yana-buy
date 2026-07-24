import { Link } from "react-router-dom";
import { useData } from "../../context/DataContext";
import StoreLogo from "../../components/StoreLogo";
import HeroSlider from "../../components/HeroSlider";

export default function Restaurants() {
  const { restaurants, menuItems } = useData();
  const approved = restaurants.filter((r) => r.status === "approved");

  return (
    <div>
      <HeroSlider mode="food" />

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
              🍲 Order food
            </h1>
            <p className="text-sm text-ink/60 mt-1">Pick a restaurant and order for delivery.</p>
          </div>
          {approved.length > 0 && (
            <span className="text-xs font-mono text-teal-600 bg-teal/10 px-3 py-1.5 rounded-full">
              {approved.length} restaurant{approved.length === 1 ? "" : "s"} nearby
            </span>
          )}
        </div>

        {approved.length === 0 ? (
          <p className="text-ink/50 py-12 text-center">No restaurants available yet — check back soon.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {approved.map((r) => {
              const items = menuItems.filter((m) => m.restaurantId === r.id && m.available);
              return (
                <Link
                  key={r.id}
                  to={`/food/restaurant/${r.id}`}
                  className="bg-white border border-ink/10 rounded-lg overflow-hidden hover:shadow-lift hover:-translate-y-0.5 transition-all duration-200"
                >
                  <StoreLogo
                    image={r.logoImage}
                    emoji={r.logoEmoji}
                    style={{ background: `linear-gradient(145deg, ${r.color}33, ${r.color}0d)` }}
                    sizeClass="w-full h-28"
                    textSizeClass="text-4xl"
                    roundedClass=""
                  />
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{r.name}</p>
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
                        style={{ background: `${r.color}1a`, color: r.color }}
                      >
                        {r.cuisine}
                      </span>
                    </div>
                    <p className="text-xs text-ink/50 mt-0.5">{r.location}</p>
                    <p className="text-xs text-ink/40 mt-1">{items.length} menu items</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
