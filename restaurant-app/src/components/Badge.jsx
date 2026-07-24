const STYLES = {
  approved: "bg-teal/10 text-teal-600 ring-1 ring-teal/20",
  active: "bg-teal/10 text-teal-600 ring-1 ring-teal/20",
  paid: "bg-teal/10 text-teal-600 ring-1 ring-teal/20",
  accepted: "bg-teal/10 text-teal-600 ring-1 ring-teal/20",
  fulfilled: "bg-teal/10 text-teal-600 ring-1 ring-teal/20",
  delivered: "bg-teal/10 text-teal-600 ring-1 ring-teal/20",
  pending: "bg-mango/20 text-mango-600 ring-1 ring-mango/25",
  quoted: "bg-mango/20 text-mango-600 ring-1 ring-mango/25",
  preparing: "bg-mango/20 text-mango-600 ring-1 ring-mango/25",
  out_for_delivery: "bg-mango/20 text-mango-600 ring-1 ring-mango/25",
  rejected: "bg-coral/10 text-coral-600 ring-1 ring-coral/20",
  cancelled: "bg-coral/10 text-coral-600 ring-1 ring-coral/20",
  draft: "bg-ink/[0.06] text-ink/60 ring-1 ring-ink/10",
};

export default function Badge({ status }) {
  const cls = STYLES[status] || "bg-ink/[0.06] text-ink/60 ring-1 ring-ink/10";
  return (
    <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${cls}`}>
      {String(status).replace(/_/g, " ")}
    </span>
  );
}
