import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import DashboardShell from "../components/DashboardShell";
import Badge from "../components/Badge";
import LogoUpload from "../components/LogoUpload";
import { RESTAURANT_LINKS } from "./RestaurantDashboard";

const EMOJIS = ["🍲", "🥡", "🍔", "🍕", "🍜", "🥘", "🍗", "🌶️", "🥗", "🍰", "☕", "🍞"];
const COLORS = ["#C8102E", "#F5A100", "#1F7A4D", "#2F5CA3", "#1B3A6B"];

export default function RestaurantSettings() {
  const { currentUser } = useAuth();
  const { restaurantForOwner, createRestaurant, updateRestaurant } = useData();
  const restaurant = restaurantForOwner(currentUser.id);

  const [form, setForm] = useState(
    restaurant
      ? {
          name: restaurant.name,
          description: restaurant.description,
          cuisine: restaurant.cuisine,
          location: restaurant.location,
          logoEmoji: restaurant.logoEmoji,
          logoImage: restaurant.logoImage || null,
        }
      : { name: "", description: "", cuisine: "", location: "", logoEmoji: "🍲", logoImage: null }
  );
  const [saved, setSaved] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (restaurant) {
      updateRestaurant(restaurant.id, form);
    } else {
      createRestaurant({
        ownerId: currentUser.id,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        slug: form.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-"),
        ...form,
      });
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <DashboardShell title="Restaurant dashboard" subtitle={restaurant?.name || currentUser.email} links={RESTAURANT_LINKS}>
      <div className="bg-white border border-ink/10 rounded-lg p-6 max-w-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold">
            {restaurant ? "Restaurant settings" : "Open a restaurant"}
          </h2>
          {restaurant && <Badge status={restaurant.status} />}
        </div>
        {!restaurant && (
          <p className="text-sm text-ink/60 mb-4">
            Set up your restaurant profile below, then add menu items once it's approved.
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Restaurant name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Description</label>
            <textarea
              required
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink/70 mb-1">Cuisine</label>
              <input
                required
                placeholder="e.g. Liberian, Chinese"
                value={form.cuisine}
                onChange={(e) => setForm((f) => ({ ...f, cuisine: e.target.value }))}
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/70 mb-1">Location</label>
              <input
                required
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
              />
            </div>
          </div>
          <LogoUpload
            image={form.logoImage}
            onChange={(url) => setForm((f) => ({ ...f, logoImage: url }))}
            emoji={form.logoEmoji}
            color={restaurant?.color}
          />
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-2">
              Fallback icon {form.logoImage && <span className="text-ink/40">(shown if you remove the photo)</span>}
            </label>
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map((e) => (
                <button
                  type="button"
                  key={e}
                  onClick={() => setForm((f) => ({ ...f, logoEmoji: e }))}
                  className={`w-10 h-10 rounded-full text-lg border-2 ${
                    form.logoEmoji === e ? "border-teal" : "border-transparent bg-sand"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            className="bg-indigo-950 hover:bg-indigo-900 text-white font-semibold px-5 py-2.5 rounded-md text-sm"
          >
            {restaurant ? "Save changes" : "Create restaurant"}
          </button>
          {saved && <p className="text-teal-600 text-sm">Saved ✓</p>}
        </form>
        {restaurant?.status === "pending" && (
          <p className="text-xs text-mango-600 mt-4">Awaiting admin approval before it's visible to customers.</p>
        )}
      </div>
    </DashboardShell>
  );
}
