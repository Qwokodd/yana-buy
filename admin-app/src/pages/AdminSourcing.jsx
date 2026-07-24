import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import DashboardShell from "../components/DashboardShell";
import Badge from "../components/Badge";
import { ADMIN_LINKS } from "./AdminDashboard";
import { imageUrl } from "../utils/upload";
import { formatPrice } from "../utils/storage";

function QuoteForm({ request, onSave }) {
  const [price, setPrice] = useState(request.quotedPrice || "");
  const [days, setDays] = useState(request.quotedShippingDays || 20);
  const [notes, setNotes] = useState(request.adminNotes || "");

  return (
    <div className="grid sm:grid-cols-4 gap-2 items-end mt-3 bg-sand/60 rounded-md p-3">
      <div>
        <label className="block text-[11px] text-ink/60 mb-1">Landed price (USD)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full border border-ink/15 rounded-md px-2 py-1.5 text-xs font-mono"
        />
      </div>
      <div>
        <label className="block text-[11px] text-ink/60 mb-1">Delivery (days)</label>
        <input
          type="number"
          min="1"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="w-full border border-ink/15 rounded-md px-2 py-1.5 text-xs font-mono"
        />
      </div>
      <div className="sm:col-span-1">
        <label className="block text-[11px] text-ink/60 mb-1">Notes (optional)</label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full border border-ink/15 rounded-md px-2 py-1.5 text-xs"
        />
      </div>
      <button
        onClick={() =>
          onSave({
            status: "quoted",
            quotedPrice: Number(price) || 0,
            quotedShippingDays: Number(days) || 0,
            adminNotes: notes,
          })
        }
        className="bg-indigo-950 hover:bg-indigo-900 text-white font-semibold px-3 py-1.5 rounded-md text-xs"
      >
        Send quote
      </button>
    </div>
  );
}

export default function AdminSourcing() {
  const { currentUser, users } = useAuth();
  const { sourcingRequests, updateSourcingRequest, deleteSourcingRequest } = useData();

  const sorted = [...sourcingRequests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <DashboardShell title="Admin dashboard" subtitle={currentUser.email} links={ADMIN_LINKS}>
      <h2 className="font-display font-semibold mb-4">China sourcing requests ({sorted.length})</h2>

      {sorted.length === 0 ? (
        <div className="bg-white border border-ink/10 rounded-lg p-8 text-center text-ink/50">
          No sourcing requests yet.
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((r) => {
            const customer = users.find((u) => u.id === r.customerId);
            return (
              <div key={r.id} className="bg-white border border-ink/10 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-mono text-sm font-semibold">#{r.id.slice(-6).toUpperCase()}</p>
                    <p className="text-xs text-ink/50">
                      {customer?.name} · {customer?.email} · {new Date(r.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge status={r.status} />
                </div>

                <p className="text-sm text-ink/80 mt-2">{r.description}</p>
                <p className="text-xs text-ink/50 mt-1">
                  Qty: {r.quantity} {r.budget && `· Budget: ${r.budget}`}
                </p>
                {r.productLink && (
                  <a href={r.productLink} target="_blank" rel="noreferrer" className="text-xs text-teal-600 hover:underline break-all">
                    {r.productLink}
                  </a>
                )}
                {r.images?.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {r.images.map((src, i) => (
                      <a key={src + i} href={imageUrl(src)} target="_blank" rel="noreferrer">
                        <img src={imageUrl(src)} alt="" className="w-14 h-14 rounded-md object-cover border border-ink/10" />
                      </a>
                    ))}
                  </div>
                )}

                {r.status === "quoted" && (
                  <p className="text-xs text-mango-600 mt-2">
                    Quoted {formatPrice(r.quotedPrice || 0)} · ~{r.quotedShippingDays} days — awaiting customer.
                  </p>
                )}
                {(r.status === "accepted" || r.status === "fulfilled") && (
                  <p className="text-xs text-teal-600 mt-2">
                    Quote accepted: {formatPrice(r.quotedPrice || 0)} · ~{r.quotedShippingDays} days.
                  </p>
                )}

                {(r.status === "pending" || r.status === "quoted") && (
                  <QuoteForm request={r} onSave={(patch) => updateSourcingRequest(r.id, patch)} />
                )}

                <div className="flex gap-4 mt-3 text-xs">
                  {r.status === "accepted" && (
                    <button
                      onClick={() => updateSourcingRequest(r.id, { status: "fulfilled" })}
                      className="text-teal-600 font-medium"
                    >
                      Mark fulfilled
                    </button>
                  )}
                  {r.status !== "rejected" && r.status !== "fulfilled" && (
                    <button
                      onClick={() => updateSourcingRequest(r.id, { status: "rejected" })}
                      className="text-coral-600 font-medium"
                    >
                      Reject
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (confirm("Delete this sourcing request?")) deleteSourcingRequest(r.id);
                    }}
                    className="text-ink/40 font-medium"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardShell>
  );
}
