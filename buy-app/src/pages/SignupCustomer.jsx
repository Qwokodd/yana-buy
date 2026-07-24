import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function SignupCustomer() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    const res = signup({ ...form, role: "customer" });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    navigate("/account");
  }

  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <h1 className="font-display text-2xl font-semibold mb-1">Create your account</h1>
      <p className="text-sm text-ink/50 mb-6">Sign up to buy from stores and individual sellers across Yana Buy.</p>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-ink/10 rounded-lg p-6">
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
          <label className="block text-xs font-medium text-ink/70 mb-1">Password</label>
          <input
            type="password"
            required
            value={form.password}
            onChange={update("password")}
            className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
          />
        </div>
        {error && <p className="text-sm text-coral-600">{error}</p>}
        <button
          type="submit"
          className="w-full bg-indigo-950 hover:bg-indigo-900 text-white font-semibold py-2.5 rounded-md"
        >
          Create account
        </button>
      </form>

      <p className="text-sm text-ink/60 mt-6 text-center">
        Already have an account?{" "}
        <Link to="/login" className="text-teal-600 font-medium">Log in</Link>
      </p>
    </div>
  );
}
