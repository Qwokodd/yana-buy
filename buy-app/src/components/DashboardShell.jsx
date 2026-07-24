import { NavLink } from "react-router-dom";

export default function DashboardShell({ title, subtitle, links, children }) {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8">
      <aside className="md:sticky md:top-6 md:self-start">
        <div className="mb-5 px-1">
          <h1 className="font-display text-xl font-semibold text-ink">{title}</h1>
          {subtitle && <p className="text-xs text-ink/50 mt-0.5">{subtitle}</p>}
        </div>
        <nav className="flex md:flex-col gap-1 overflow-x-auto scrollbar-none bg-white/60 backdrop-blur-sm md:bg-transparent md:p-0 p-1 rounded-xl">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `whitespace-nowrap px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-grad-indigo text-white shadow-soft"
                    : "text-ink/60 hover:bg-white hover:text-ink hover:shadow-soft"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
