import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      <p className="font-display text-6xl font-semibold text-indigo-950/20 mb-2">404</p>
      <h1 className="font-display text-xl font-semibold mb-2">Page not found</h1>
      <p className="text-sm text-ink/50 mb-6">This page doesn't exist or has moved.</p>
      <Link to="/" className="inline-block bg-indigo-950 text-white font-semibold px-5 py-2.5 rounded-md text-sm">
        Back to dashboard
      </Link>
    </div>
  );
}
