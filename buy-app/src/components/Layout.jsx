import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import ModeToggle from "./ModeToggle";

export default function Layout() {
  const location = useLocation();
  const isFood = location.pathname.startsWith("/food");

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className={`${isFood ? "bg-coral" : "bg-indigo-950"} py-2`}>
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-center sm:justify-start">
          <ModeToggle size="sm" />
        </div>
      </div>
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
