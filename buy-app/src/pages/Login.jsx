import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const DEMO_ACCOUNTS = [
  { role: "Vendor", email: "vendor@yanabuy.com", password: "vendor123" },
  { role: "Customer", email: "customer@yanabuy.com", password: "customer123" },
];

export default function Login() {
  const { login, logout, currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function redirectFor(user) {
    if (user.role === "vendor") return "/vendor";
    return location.state?.from || "/account";
  }

  function handleSubmit(e) {
    e.preventDefault();
    const res = login(email, password);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.user.role === "admin") {
      logout();
      setError("Admin accounts sign in from the admin portal, not here.");
      return;
    }
    navigate(redirectFor(res.user));
  }

  if (currentUser && currentUser.role !== "admin") {
    navigate(redirectFor(currentUser));
    return null;
  }

  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <h1 className="font-display text-2xl font-semibold mb-1">Welcome back</h1>
      <p className="text-sm text-ink/50 mb-6">Log in to your Yana Buy account.</p>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-ink/10 rounded-lg p-6">
        <div>
          <label className="block text-xs font-medium text-ink/70 mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/70 mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
          />
        </div>
        {error && <p className="text-sm text-coral-600">{error}</p>}
        <button
          type="submit"
          className="w-full bg-indigo-950 hover:bg-indigo-900 text-white font-semibold py-2.5 rounded-md"
        >
          Log in
        </button>
      </form>

      <div className="mt-6 bg-sand rounded-lg p-4">
        <p className="text-xs font-semibold text-ink/70 mb-2">Demo accounts</p>
        <ul className="space-y-1 text-xs text-ink/60 font-mono">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.email}>
              <button
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(a.password);
                }}
                className="hover:text-teal-600 underline decoration-dotted"
              >
                {a.role}: {a.email} / {a.password}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-sm text-ink/60 mt-6 text-center">
        New to Yana Buy?{" "}
        <Link to="/signup" className="text-teal-600 font-medium">
          Create a customer account
        </Link>{" "}
        or{" "}
        <Link to="/sell" className="text-teal-600 font-medium">
          become a vendor
        </Link>
        .
      </p>
    </div>
  );
}
