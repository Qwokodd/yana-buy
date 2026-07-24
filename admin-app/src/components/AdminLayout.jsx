import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AdminLayout() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-indigo-950 text-white">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <p className="font-display text-lg font-bold tracking-tight">
            Yana Buy<span className="text-mango">.</span>
            <span className="text-white/50 font-medium text-sm ml-2">Admin</span>
          </p>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-white/70">{currentUser?.email}</span>
            <button
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="text-white/80 hover:text-white font-medium"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
