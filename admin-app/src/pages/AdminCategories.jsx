import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import DashboardShell from "../components/DashboardShell";
import StoreLogo from "../components/StoreLogo";
import LogoUpload from "../components/LogoUpload";
import { ADMIN_LINKS } from "./AdminDashboard";

const COLORS = ["#1F2266", "#3B3FA0", "#FF5A5F", "#0BA6A0", "#F5A100", "#3B8F3B", "#C77DFF", "#0077B6", "#6B4423", "#8A4B08"];
const EMPTY_FORM = { name: "", icon: "🛍️", iconImage: null, color: COLORS[0] };

export default function AdminCategories() {
  const { currentUser } = useAuth();
  const { categories, products, addCategory, updateCategory, deleteCategory } = useData();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editingId) {
      updateCategory(editingId, form);
      setEditingId(null);
    } else {
      addCategory(form);
    }
    setForm(EMPTY_FORM);
  }

  function startEdit(cat) {
    setEditingId(cat.id);
    setForm({ name: cat.name, icon: cat.icon, iconImage: cat.iconImage || null, color: cat.color });
  }

  return (
    <DashboardShell title="Admin dashboard" subtitle={currentUser.email} links={ADMIN_LINKS}>
      <h2 className="font-display font-semibold mb-4">Categories ({categories.length})</h2>

      <form onSubmit={handleSubmit} className="bg-white border border-ink/10 rounded-lg p-5 mb-6 space-y-4">
        <LogoUpload
          image={form.iconImage}
          onChange={(url) => setForm((f) => ({ ...f, iconImage: url }))}
          emoji={form.icon}
          color={form.color}
          label="Category icon (upload a PNG, or fall back to an emoji below)"
        />
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Fallback emoji</label>
            <input
              value={form.icon}
              onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
              className="w-16 border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal text-center"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-ink/70 mb-1">Category name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Color</label>
            <select
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              className="border border-ink/15 rounded-md px-2 py-2 text-sm outline-none focus:border-teal"
            >
              {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button type="submit" className="bg-indigo-950 hover:bg-indigo-900 text-white font-semibold px-4 py-2 rounded-md text-sm">
            {editingId ? "Save" : "+ Add category"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}
              className="text-xs text-ink/50"
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {categories.map((c) => (
          <div key={c.id} className="bg-white border border-ink/10 rounded-lg p-4 flex items-center gap-3">
            <StoreLogo image={c.iconImage} emoji={c.icon} color={c.color} sizeClass="w-10 h-10" textSizeClass="text-lg" />
            <div className="flex-1">
              <p className="font-medium text-sm">{c.name}</p>
              <p className="text-xs text-ink/50">{products.filter((p) => p.category === c.id).length} products</p>
            </div>
            <button onClick={() => startEdit(c)} className="text-teal-600 text-xs font-medium">Edit</button>
            <button
              onClick={() => {
                if (confirm(`Delete category "${c.name}"?`)) deleteCategory(c.id);
              }}
              className="text-coral-600 text-xs font-medium"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
