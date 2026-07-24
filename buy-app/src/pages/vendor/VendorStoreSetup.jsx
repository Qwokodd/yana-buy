import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useData } from "../../context/DataContext";
import DashboardShell from "../../components/DashboardShell";
import Badge from "../../components/Badge";
import LogoUpload from "../../components/LogoUpload";
import { VENDOR_LINKS } from "./VendorDashboard";

const EMOJIS = ["🏪", "🔌", "👗", "🛋️", "💄", "🛒", "🍼", "⚽", "🚗", "📚", "🎨", "🥖"];

export default function VendorStoreSetup() {
  const { currentUser } = useAuth();
  const { storeForOwner, updateStore } = useData();
  const store = storeForOwner(currentUser.id);
  const [form, setForm] = useState(
    store
      ? {
          name: store.name,
          description: store.description,
          location: store.location,
          logoEmoji: store.logoEmoji,
          logoImage: store.logoImage || null,
        }
      : { name: "", description: "", location: "", logoEmoji: "🏪", logoImage: null }
  );
  const [saved, setSaved] = useState(false);

  if (!store) {
    return (
      <DashboardShell title="Vendor dashboard" subtitle={currentUser.email} links={VENDOR_LINKS}>
        <p className="text-ink/60">
          You need to <a href="/sell" className="text-teal-600 font-medium">create a store</a> first.
        </p>
      </DashboardShell>
    );
  }

  function handleSubmit(e) {
    e.preventDefault();
    updateStore(store.id, form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <DashboardShell title="Vendor dashboard" subtitle={store.name} links={VENDOR_LINKS}>
      <div className="bg-white border border-ink/10 rounded-lg p-6 max-w-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold">Store settings</h2>
          <Badge status={store.status} />
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Store name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Location</label>
            <input
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
            />
          </div>
          <LogoUpload
            image={form.logoImage}
            onChange={(url) => setForm((f) => ({ ...f, logoImage: url }))}
            emoji={form.logoEmoji}
            color={store.color}
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
            Save changes
          </button>
          {saved && <p className="text-teal-600 text-sm">Saved ✓</p>}
        </form>
      </div>
    </DashboardShell>
  );
}
