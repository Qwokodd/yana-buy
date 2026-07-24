import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import DashboardShell from "../components/DashboardShell";
import { ADMIN_LINKS } from "./AdminDashboard";

export default function AdminUsers() {
  const { currentUser, users, updateUser } = useAuth();
  const [filter, setFilter] = useState("all");

  const list = filter === "all" ? users : users.filter((u) => u.role === filter);

  return (
    <DashboardShell title="Admin dashboard" subtitle={currentUser.email} links={ADMIN_LINKS}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="font-display font-semibold">Users ({list.length})</h2>
        <div className="flex gap-2">
          {["all", "customer", "vendor", "admin"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border capitalize ${
                filter === f ? "bg-indigo-950 text-white border-indigo-950" : "border-ink/15 text-ink/60"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-ink/10 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-sand text-ink/60 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">Phone</th>
              <th className="text-left px-4 py-2">Role</th>
              <th className="text-left px-4 py-2">Joined</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="border-t border-ink/5">
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 text-ink/60">{u.email}</td>
                <td className="px-4 py-3 text-ink/60">{u.phone}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => updateUser(u.id, { role: e.target.value })}
                    disabled={u.id === currentUser.id}
                    className="border border-ink/15 rounded-md px-2 py-1 text-xs capitalize disabled:opacity-50"
                  >
                    <option value="customer">Customer</option>
                    <option value="vendor">Vendor</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-ink/50 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardShell>
  );
}
