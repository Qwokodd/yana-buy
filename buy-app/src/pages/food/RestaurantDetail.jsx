import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useData } from "../../context/DataContext";
import { useFoodCart } from "../../context/FoodCartContext";
import { imageUrl } from "../../utils/upload";
import { formatPrice } from "../../utils/storage";
import StoreLogo from "../../components/StoreLogo";

export default function RestaurantDetail() {
  const { id } = useParams();
  const { restaurants, menuItems } = useData();
  const { addItem } = useFoodCart();

  const restaurant = restaurants.find((r) => r.id === id);
  const items = useMemo(
    () => menuItems.filter((m) => m.restaurantId === id && m.available),
    [menuItems, id]
  );
  const byCategory = useMemo(() => {
    const groups = {};
    for (const m of items) {
      const key = m.category || "Menu";
      groups[key] = groups[key] || [];
      groups[key].push(m);
    }
    return groups;
  }, [items]);

  if (!restaurant || restaurant.status !== "approved") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-ink/60">This restaurant isn't available.</p>
        <Link to="/food" className="text-teal-600 font-medium">Back to restaurants</Link>
      </div>
    );
  }

  function handleAdd(menuItemId) {
    const ok = addItem(restaurant.id, menuItemId, 1);
    if (!ok) {
      const confirmSwitch = confirm(
        "Your food cart has items from another restaurant. Start a new order here and clear the old one?"
      );
      if (confirmSwitch) addItem(restaurant.id, menuItemId, 1, { force: true });
    }
  }

  return (
    <div>
      <div className="text-white" style={{ background: restaurant.color }}>
        <div className="max-w-5xl mx-auto px-4 py-10 flex items-center gap-5">
          <StoreLogo
            image={restaurant.logoImage}
            emoji={restaurant.logoEmoji}
            style={{ background: "rgba(255,255,255,0.15)" }}
            sizeClass="w-20 h-20"
            textSizeClass="text-4xl"
          />
          <div>
            <h1 className="font-display text-3xl font-semibold">{restaurant.name}</h1>
            <p className="text-white/80 text-sm mt-1 max-w-xl">{restaurant.description}</p>
            <p className="text-white/60 text-xs mt-2">{restaurant.cuisine} · {restaurant.location}</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {items.length === 0 ? (
          <p className="text-ink/50 py-12 text-center">No menu items yet.</p>
        ) : (
          Object.entries(byCategory).map(([cat, list]) => (
            <div key={cat} className="mb-8">
              <h2 className="font-display font-semibold mb-3">{cat}</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {list.map((m) => (
                  <div key={m.id} className="flex gap-3 bg-white border border-ink/10 rounded-lg p-3">
                    <div className="w-16 h-16 rounded-md overflow-hidden shrink-0 flex items-center justify-center bg-sand text-2xl">
                      {m.images?.[0] ? (
                        <img src={imageUrl(m.images[0])} alt="" className="w-full h-full object-cover" />
                      ) : (
                        m.emoji || "🍽️"
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{m.name}</p>
                      <p className="text-xs text-ink/50 line-clamp-2 mt-0.5">{m.description}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-mono text-sm font-semibold text-indigo-900">
                          {formatPrice(m.price)}
                        </span>
                        <button
                          onClick={() => handleAdd(m.id)}
                          className="bg-mango hover:bg-mango-400 text-indigo-950 font-semibold text-xs px-3 py-1.5 rounded-md"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
