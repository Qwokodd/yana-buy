import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { CATEGORIES } from "../data/seed";
import LogoUpload from "../components/LogoUpload";

const EMOJIS = ["🏪", "🔌", "👗", "🛋️", "💄", "🛒", "🍼", "⚽", "🚗", "📚", "🎨", "🥖"];
const COLORS = ["#1F2266", "#FF5A5F", "#0BA6A0", "#F5A100", "#8A4B08", "#6B4423"];

export default function SignupVendor() {
  const { signup, currentUser } = useAuth();
  const { createStore } = useData();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    storeName: "",
    description: "",
    location: "",
    category: CATEGORIES[0].id,
    logoEmoji: EMOJIS[0],
    logoImage: null,
    color: COLORS[0],
  });
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError("");

    let ownerId = currentUser?.id;
    if (!currentUser) {
      if (form.password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      const res = signup({
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        role: "vendor",
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      ownerId = res.user.id;
    }

    createStore({
      ownerId,
      name: form.storeName,
      slug: form.storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      description: form.description,
      location: form.location,
      logoEmoji: form.logoEmoji,
      logoImage: form.logoImage,
      color: form.color,
      status: "pending",
    });

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="text-5xl mb-4">🏪</div>
        <h1 className="font-display text-2xl font-semibold mb-2">Application submitted</h1>
        <p className="text-sm text-ink/60 mb-6">
          Thanks! Your store "{form.storeName}" is now pending review. An admin will
          approve it before it appears publicly — you can check the status any time
          from your vendor dashboard.
        </p>
        <Link
          to="/vendor"
          className="inline-block bg-indigo-950 hover:bg-indigo-900 text-white font-semibold px-5 py-2.5 rounded-md"
        >
          Go to vendor dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-14">
      <h1 className="font-display text-2xl font-semibold mb-1">Sell on Yana Buy</h1>
      <p className="text-sm text-ink/50 mb-6">
        Open your own store and showcase your products to thousands of buyers.
        Every new store is reviewed by an admin before it goes live.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white border border-ink/10 rounded-lg p-6">
        {!currentUser && (
          <fieldset className="space-y-4">
            <legend className="font-display font-semibold text-sm mb-1">Your details</legend>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink/70 mb-1">Full name</label>
                <input
                  required
                  value={form.name}
                  onChange={update("name")}
                  className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/70 mb-1">Phone number</label>
                <input
                  required
                  value={form.phone}
                  onChange={update("phone")}
                  placeholder="+231 770 000 000"
                  className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/70 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={update("email")}
                  className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/70 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={form.password}
                  onChange={update("password")}
                  className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
                />
              </div>
            </div>
          </fieldset>
        )}

        <fieldset className="space-y-4">
          <legend className="font-display font-semibold text-sm mb-1">Your store</legend>
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Store name</label>
            <input
              required
              value={form.storeName}
              onChange={update("storeName")}
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">Store description</label>
            <textarea
              required
              rows={3}
              value={form.description}
              onChange={update("description")}
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink/70 mb-1">Location</label>
              <input
                required
                value={form.location}
                onChange={update("location")}
                placeholder="e.g. Monrovia"
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/70 mb-1">Main category</label>
              <select
                value={form.category}
                onChange={update("category")}
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <LogoUpload
            image={form.logoImage}
            onChange={(url) => setForm((f) => ({ ...f, logoImage: url }))}
            emoji={form.logoEmoji}
            color={form.color}
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
        </fieldset>

        {error && <p className="text-sm text-coral-600">{error}</p>}

        <button
          type="submit"
          className="w-full bg-mango hover:bg-mango-400 text-indigo-950 font-semibold py-2.5 rounded-md"
        >
          Submit application
        </button>
      </form>
    </div>
  );
}
