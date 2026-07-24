export default function StatCard({ label, value, accent = "indigo" }) {
  const accents = {
    indigo: "text-indigo-900",
    teal: "text-teal-600",
    coral: "text-coral-600",
    mango: "text-mango-600",
  };
  const rings = {
    indigo: "hover:shadow-glow",
    teal: "hover:shadow-[0_0_0_1px_rgba(31,122,77,0.15),0_8px_24px_-8px_rgba(31,122,77,0.25)]",
    coral: "hover:shadow-[0_0_0_1px_rgba(200,16,46,0.15),0_8px_24px_-8px_rgba(200,16,46,0.25)]",
    mango: "hover:shadow-[0_0_0_1px_rgba(255,180,0,0.2),0_8px_24px_-8px_rgba(255,180,0,0.3)]",
  };
  return (
    <div className={`bg-white border border-ink/[0.06] rounded-xl p-4 shadow-soft transition-shadow duration-200 ${rings[accent] || rings.indigo}`}>
      <p className="text-xs text-ink/45 font-medium tracking-wide">{label}</p>
      <p className={`font-display text-2xl font-semibold mt-1.5 ${accents[accent] || accents.indigo}`}>
        {value}
      </p>
    </div>
  );
}
