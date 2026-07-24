import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import DashboardShell from "../components/DashboardShell";
import MultiImageUpload from "../components/MultiImageUpload";
import { RESTAURANT_LINKS } from "./RestaurantDashboard";

export default function MenuItemForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { restaurantForOwner, menuItems, addMenuItem, updateMenuItem } = useData();
  const restaurant = restaurantForOwner(currentUser.id);
  const existing = id ? menuItems.find((m) => m.id === id) : null;

  const [form, setForm] = useState(
    existing || {
      name: "",
      description: "",
      price: "",
      category: "",
      emoji: "🍽️",
      images: [],
      available: true,
    }
  );
  const [error, setError] = useState("");

  if (!restaurant) {
    return (
      <DashboardShell title="Restaurant dashboard" subtitle={currentUser.email} links={RESTAURANT_LINKS}>
        <p className="text-ink/60">Open a restaurant first before adding menu items.</p>
      </DashboardShell>
    );
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (Number(form.price) <= 0) {
      setError("Price must be greater than zero.");
      return;
    }
    const payload = {
      ...form,
      price: Number(form.price),
      restaurantId: restaurant.id,
    };
    if (existing) {
      updateMenuItem(existing.id, payload);
    } else {
      addMenuItem(payload);
    }
    navigate("/menu-items");
  }

  return (
    <DashboardShell title="Restaurant dashboard" subtitle={restaurant.name} links={RESTAURANT_LINKS}>
      <div className="bg-white border border-ink/10 rounded-lg p-6 max-w-xl">
        <h2 className="font-display font-semibold mb-4">
          {existing ? "Edit menu item" : "Add a menu item"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Dish name</label>
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
              <label className="block text-xs font-medium text-ink/70 mb-1">Price (USD)</label>
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/70 mb-1">Menu category</label>
              <input
                required
                placeholder="e.g. Rice dishes, Soups"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
              />
            </div>
          </div>

          <MultiImageUpload
            label="Dish photos"
            images={form.images || []}
            onChange={(images) => setForm((f) => ({ ...f, images }))}
          />

          {error && <p className="text-sm text-coral-600">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" className="bg-mango hover:bg-mango-400 text-indigo-950 font-semibold px-5 py-2.5 rounded-md text-sm">
              {existing ? "Save changes" : "Add to menu"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/menu-items")}
              className="border border-ink/15 font-semibold px-5 py-2.5 rounded-md text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </DashboardShell>
  );
}
