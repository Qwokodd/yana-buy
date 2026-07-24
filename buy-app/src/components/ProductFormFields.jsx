import { useData } from "../context/DataContext";
import MultiImageUpload from "./MultiImageUpload";

export default function ProductFormFields({ form, setForm }) {
  const { categories } = useData();

  function field(key) {
    return {
      value: form[key] ?? "",
      onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })),
    };
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-ink/70 mb-1">Product title</label>
        <input required {...field("title")} className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal" />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink/70 mb-1">Description</label>
        <textarea required rows={3} {...field("description")} className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal" />
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-ink/70 mb-1">Price (USD)</label>
          <input required type="number" min="0" step="0.01" {...field("price")} className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal font-mono" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/70 mb-1">Compare-at price</label>
          <input type="number" min="0" step="0.01" {...field("compareAtPrice")} placeholder="Optional" className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal font-mono" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/70 mb-1">Stock quantity</label>
          <input required type="number" min="0" {...field("stock")} className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal font-mono" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-ink/70 mb-1">Category</label>
        <select {...field("category")} className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
      </div>

      <MultiImageUpload
        label="Product photos"
        images={form.images || []}
        onChange={(images) => setForm((f) => ({ ...f, images }))}
      />

      <div className="border border-ink/10 rounded-md p-3 bg-sand/50">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!form.shipsFromChina}
            onChange={(e) => setForm((f) => ({ ...f, shipsFromChina: e.target.checked }))}
            className="mt-0.5"
          />
          <span className="text-sm">
            <span className="font-medium">This item ships from China</span>
            <span className="block text-xs text-ink/50 mt-0.5">
              Shows a "Ships from China" badge with a longer delivery estimate on the listing.
            </span>
          </span>
        </label>
        {form.shipsFromChina && (
          <div className="mt-3 max-w-[220px]">
            <label className="block text-xs font-medium text-ink/70 mb-1">Estimated delivery (days)</label>
            <input
              type="number"
              min="1"
              value={form.chinaDeliveryDays ?? 20}
              onChange={(e) => setForm((f) => ({ ...f, chinaDeliveryDays: Number(e.target.value) }))}
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal font-mono"
            />
          </div>
        )}
      </div>
    </div>
  );
}
