import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import MultiImageUpload from "../components/MultiImageUpload";
import Badge from "../components/Badge";
import { formatPrice } from "../utils/storage";

const STATUS_COPY = {
  pending: "Waiting for a quote from our sourcing team.",
  quoted: "We've sent you a quote below — accept it to move forward.",
  accepted: "Quote accepted — we're placing the order with our supplier.",
  fulfilled: "Sourced and on the way / delivered.",
  rejected: "We weren't able to source this one.",
};

export default function Sourcing() {
  const { currentUser } = useAuth();
  const { sourcingRequests, createSourcingRequest, updateSourcingRequest } = useData();

  const [form, setForm] = useState({
    productLink: "",
    description: "",
    quantity: 1,
    budget: "",
    images: [],
  });
  const [submitted, setSubmitted] = useState(false);

  const myRequests = sourcingRequests
    .filter((r) => r.customerId === currentUser.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  function handleSubmit(e) {
    e.preventDefault();
    createSourcingRequest({
      customerId: currentUser.id,
      productLink: form.productLink.trim(),
      description: form.description.trim(),
      quantity: Number(form.quantity) || 1,
      budget: form.budget.trim(),
      images: form.images,
    });
    setForm({ productLink: "", description: "", quantity: 1, budget: "", images: [] });
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  }

  function acceptQuote(id) {
    updateSourcingRequest(id, { status: "accepted" });
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
          🇨🇳 Buy &amp; ship from China
        </h1>
        <p className="text-sm text-ink/60 mt-2">
          Found something on a Chinese site (or seen it somewhere and want us to find it)? Send us a
          link or photos and details, and our sourcing team will quote you a landed price — item cost
          plus shipping to Liberia.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-ink/10 rounded-lg p-5 space-y-4 mb-10">
        <div>
          <label className="block text-xs font-medium text-ink/70 mb-1">Product link (optional)</label>
          <input
            type="url"
            placeholder="https://..."
            value={form.productLink}
            onChange={(e) => setForm((f) => ({ ...f, productLink: e.target.value }))}
            className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/70 mb-1">Describe what you want</label>
          <textarea
            required
            rows={3}
            placeholder="Item, size, colour, specs — anything that helps us find the right one"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Quantity</label>
            <input
              type="number"
              min="1"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Budget (optional)</label>
            <input
              placeholder="e.g. up to $50"
              value={form.budget}
              onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
            />
          </div>
        </div>
        <MultiImageUpload
          label="Reference photos"
          images={form.images}
          onChange={(images) => setForm((f) => ({ ...f, images }))}
        />
        <button
          type="submit"
          className="bg-indigo-950 hover:bg-indigo-900 text-white font-semibold px-5 py-2.5 rounded-md text-sm"
        >
          Submit request
        </button>
        {submitted && <p className="text-teal-600 text-sm">Request sent — we'll be in touch with a quote ✓</p>}
      </form>

      <h2 className="font-display font-semibold mb-4">Your requests ({myRequests.length})</h2>
      {myRequests.length === 0 ? (
        <div className="bg-white border border-ink/10 rounded-lg p-8 text-center text-ink/50">
          No sourcing requests yet.
        </div>
      ) : (
        <div className="space-y-3">
          {myRequests.map((r) => (
            <div key={r.id} className="bg-white border border-ink/10 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-mono text-sm font-semibold">#{r.id.slice(-6).toUpperCase()}</p>
                <Badge status={r.status} />
              </div>
              <p className="text-sm text-ink/80 mb-1">{r.description}</p>
              {r.productLink && (
                <a href={r.productLink} target="_blank" rel="noreferrer" className="text-xs text-teal-600 hover:underline break-all">
                  {r.productLink}
                </a>
              )}
              <p className="text-xs text-ink/50 mt-2">{STATUS_COPY[r.status] || ""}</p>

              {r.status === "quoted" && (
                <div className="mt-3 bg-mango/10 border border-mango/30 rounded-md p-3 flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm">
                    <p>
                      Item + shipping: <span className="font-mono font-semibold">{formatPrice(r.quotedPrice || 0)}</span>
                    </p>
                    {r.quotedShippingDays && (
                      <p className="text-xs text-ink/50">Estimated delivery: ~{r.quotedShippingDays} days</p>
                    )}
                    {r.adminNotes && <p className="text-xs text-ink/50 mt-1">{r.adminNotes}</p>}
                  </div>
                  <button
                    onClick={() => acceptQuote(r.id)}
                    className="bg-indigo-950 hover:bg-indigo-900 text-white font-semibold px-4 py-2 rounded-md text-xs"
                  >
                    Accept quote
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
