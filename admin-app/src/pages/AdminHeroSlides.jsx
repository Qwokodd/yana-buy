import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import DashboardShell from "../components/DashboardShell";
import { imageUrl, uploadImages, MAX_IMAGE_BYTES } from "../utils/upload";
import { ADMIN_LINKS } from "./AdminDashboard";

const EMPTY_FORM = {
  theme: "shop",
  eyebrow: "",
  title: "",
  subtitle: "",
  image: null,
  emoji: "🛍️",
  buttonText: "",
  buttonLink: "",
  buttonText2: "",
  buttonLink2: "",
  active: true,
};

export default function AdminHeroSlides() {
  const { currentUser } = useAuth();
  const { heroSlides, addHeroSlide, updateHeroSlide, deleteHeroSlide, reorderHeroSlides } = useData();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const sorted = [...heroSlides].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const shopSlides = sorted.filter((s) => (s.theme || "shop") === "shop");
  const foodSlides = sorted.filter((s) => s.theme === "food");

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    if (editingId) {
      updateHeroSlide(editingId, form);
      setEditingId(null);
    } else {
      addHeroSlide(form);
    }
    setForm(EMPTY_FORM);
  }

  function startEdit(slide) {
    setEditingId(slide.id);
    setForm({ ...EMPTY_FORM, ...slide });
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image must be under 5MB.");
      return;
    }
    setUploading(true);
    try {
      const [url] = await uploadImages([file]);
      setForm((f) => ({ ...f, image: url }));
    } catch (err) {
      setError(err.message || "Upload failed. Is the server running?");
    } finally {
      setUploading(false);
    }
  }

  function move(group, id, dir) {
    const ids = group.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorderHeroSlides(ids);
  }

  return (
    <DashboardShell title="Admin dashboard" subtitle={currentUser.email} links={ADMIN_LINKS}>
      <h2 className="font-display font-semibold mb-1">Hero slides ({heroSlides.length})</h2>
      <p className="text-xs text-ink/50 mb-4">
        These rotate on the homepage banner. Tag each slide "Shop" or "Restaurant" so it shows in the
        right mode — changes go live for every customer instantly, no app update needed.
      </p>

      <form onSubmit={handleSubmit} className="bg-white border border-ink/10 rounded-lg p-5 mb-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-ink/70 mb-2">Banner image (16:9 works best)</label>
          <div className="flex items-center gap-4">
            <div className="w-40 aspect-video rounded-md overflow-hidden shrink-0 border border-ink/10 bg-sand flex items-center justify-center text-3xl">
              {form.image ? (
                <img src={imageUrl(form.image)} alt="" className="w-full h-full object-cover" />
              ) : (
                form.emoji || "🛍️"
              )}
            </div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <label className="inline-flex items-center bg-white border border-ink/15 hover:border-teal rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer">
                  {uploading ? "Uploading…" : form.image ? "Replace image" : "Upload image"}
                  <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={handleFile} />
                </label>
                {form.image && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, image: null }))}
                    className="text-xs text-coral-600 font-medium px-2"
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="text-[11px] text-ink/40">Falls back to the emoji below if no image is set.</p>
              {error && <p className="text-xs text-coral-600">{error}</p>}
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Shows in</label>
            <select
              value={form.theme}
              onChange={(e) => setForm((f) => ({ ...f, theme: e.target.value }))}
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
            >
              <option value="shop">Shop mode</option>
              <option value="food">Restaurant mode</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Fallback emoji</label>
            <input
              value={form.emoji}
              onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/70 mb-1">Eyebrow (small script line, e.g. "Season Sale")</label>
          <input
            value={form.eyebrow}
            onChange={(e) => setForm((f) => ({ ...f, eyebrow: e.target.value }))}
            className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/70 mb-1">Headline (use a line break for two lines)</label>
          <textarea
            required
            rows={2}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/70 mb-1">Subtitle</label>
          <textarea
            rows={2}
            value={form.subtitle}
            onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
            className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-ink/70 mb-1">Primary button text</label>
              <input
                value={form.buttonText}
                onChange={(e) => setForm((f) => ({ ...f, buttonText: e.target.value }))}
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-ink/70 mb-1">Links to</label>
              <input
                value={form.buttonLink}
                onChange={(e) => setForm((f) => ({ ...f, buttonLink: e.target.value }))}
                placeholder="/category/cat-phones"
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-ink/70 mb-1">Secondary button text</label>
              <input
                value={form.buttonText2}
                onChange={(e) => setForm((f) => ({ ...f, buttonText2: e.target.value }))}
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-ink/70 mb-1">Links to</label>
              <input
                value={form.buttonLink2}
                onChange={(e) => setForm((f) => ({ ...f, buttonLink2: e.target.value }))}
                placeholder="/sell"
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            Active (visible on the homepage)
          </label>
          <div className="flex gap-3">
            {editingId && (
              <button
                type="button"
                onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}
                className="text-xs text-ink/50"
              >
                Cancel edit
              </button>
            )}
            <button type="submit" className="bg-indigo-950 hover:bg-indigo-900 text-white font-semibold px-4 py-2 rounded-md text-sm">
              {editingId ? "Save slide" : "+ Add slide"}
            </button>
          </div>
        </div>
      </form>

      <SlideGroup
        title="Shop mode slides"
        slides={shopSlides}
        onEdit={startEdit}
        onDelete={deleteHeroSlide}
        onToggle={(s) => updateHeroSlide(s.id, { active: !s.active })}
        onMove={(id, dir) => move(shopSlides, id, dir)}
      />
      <SlideGroup
        title="Restaurant mode slides"
        slides={foodSlides}
        onEdit={startEdit}
        onDelete={deleteHeroSlide}
        onToggle={(s) => updateHeroSlide(s.id, { active: !s.active })}
        onMove={(id, dir) => move(foodSlides, id, dir)}
      />
    </DashboardShell>
  );
}

function SlideGroup({ title, slides, onEdit, onDelete, onToggle, onMove }) {
  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-ink/70 mb-3">{title} ({slides.length})</h3>
      {slides.length === 0 ? (
        <p className="text-xs text-ink/40">No slides yet.</p>
      ) : (
        <div className="space-y-2">
          {slides.map((s, i) => (
            <div key={s.id} className="bg-white border border-ink/10 rounded-lg p-3 flex items-center gap-3">
              <div className="w-20 aspect-video rounded-md overflow-hidden shrink-0 bg-sand flex items-center justify-center text-xl">
                {s.image ? (
                  <img src={imageUrl(s.image)} alt="" className="w-full h-full object-cover" />
                ) : (
                  s.emoji || "🛍️"
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{s.title?.split("\n")[0]}</p>
                <p className="text-xs text-ink/50 truncate">{s.subtitle}</p>
              </div>
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => onMove(s.id, -1)}
                  disabled={i === 0}
                  className="text-ink/40 hover:text-ink disabled:opacity-20 text-xs leading-none"
                >
                  ▲
                </button>
                <button
                  onClick={() => onMove(s.id, 1)}
                  disabled={i === slides.length - 1}
                  className="text-ink/40 hover:text-ink disabled:opacity-20 text-xs leading-none"
                >
                  ▼
                </button>
              </div>
              <button
                onClick={() => onToggle(s)}
                className={`text-xs font-medium px-2 py-1 rounded-full ${
                  s.active !== false ? "bg-teal/10 text-teal-600" : "bg-ink/5 text-ink/40"
                }`}
              >
                {s.active !== false ? "Active" : "Hidden"}
              </button>
              <button onClick={() => onEdit(s)} className="text-teal-600 text-xs font-medium">Edit</button>
              <button
                onClick={() => { if (confirm("Delete this slide?")) onDelete(s.id); }}
                className="text-coral-600 text-xs font-medium"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
