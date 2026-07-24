export default function ChinaBadge({ days }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-950/5 text-indigo-900 border border-indigo-950/10">
      🇨🇳 Ships from China{days ? ` · ~${days} days` : ""}
    </span>
  );
}
