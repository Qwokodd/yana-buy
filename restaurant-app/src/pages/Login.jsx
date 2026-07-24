import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login, currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (currentUser) {
    navigate(location.state?.from || "/");
    return null;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const res = login(email, password);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    navigate(location.state?.from || "/");
  }

  return (
    <div className="min-h-screen bg-grad-indigo flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <p className="font-display text-2xl font-bold text-white tracking-tight">
            Yana Buy<span className="text-mango">.</span>
          </p>
          <h1 className="font-display text-xl font-semibold text-white/90 mt-2">Restaurant Portal</h1>
          <p className="text-sm text-white/60">Manage your menu and food orders</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 space-y-4 shadow-lift">
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
            className="w-full bg-indigo-950 hover:bg-indigo-900 text-white font-semibold py-2.5 rounded-md text-sm"
          >
            Log in
          </button>
        </form>

        <p className="text-center text-xs text-white/60 mt-4">
          Don't have a restaurant account yet?{" "}
          <Link to="/signup" className="text-white font-medium underline decoration-dotted">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
