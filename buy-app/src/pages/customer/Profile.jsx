import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import DashboardShell from "../../components/DashboardShell";
import LogoUpload from "../../components/LogoUpload";

const LINKS = [
  { to: "/account", label: "Profile", end: true },
  { to: "/account/orders", label: "My orders" },
  { to: "/account/food-orders", label: "My food orders" },
];

export default function Profile() {
  const { currentUser, updateUser } = useAuth();
  const [form, setForm] = useState({
    name: currentUser.name,
    phone: currentUser.phone,
    avatarImage: currentUser.avatarImage || null,
  });
  const [saved, setSaved] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    updateUser(currentUser.id, form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <DashboardShell title="My account" subtitle={currentUser.email} links={LINKS}>
      <div className="bg-white border border-ink/10 rounded-lg p-6 max-w-md">
        <h2 className="font-display font-semibold mb-4">Profile details</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <LogoUpload
            image={form.avatarImage}
            onChange={(url) => setForm((f) => ({ ...f, avatarImage: url }))}
            emoji={currentUser.name?.slice(0, 1).toUpperCase() || "?"}
            label="Profile picture"
          />
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Full name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Phone number</label>
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Email</label>
            <input
              disabled
              value={currentUser.email}
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm bg-sand text-ink/50"
            />
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
