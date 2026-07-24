import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminLayout from "./components/AdminLayout";

import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminVendors from "./pages/AdminVendors";
import AdminProducts from "./pages/AdminProducts";
import AdminProductForm from "./pages/AdminProductForm";
import AdminCategories from "./pages/AdminCategories";
import AdminUsers from "./pages/AdminUsers";
import AdminOrders from "./pages/AdminOrders";
import AdminSourcing from "./pages/AdminSourcing";
import AdminRestaurants from "./pages/AdminRestaurants";
import AdminHeroSlides from "./pages/AdminHeroSlides";
import AdminFoodOrders from "./pages/AdminFoodOrders";
import AdminPayouts from "./pages/AdminPayouts";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AdminLogin />} />

      <Route
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<AdminDashboard />} />
        <Route path="/vendors" element={<AdminVendors />} />
        <Route path="/products" element={<AdminProducts />} />
        <Route path="/products/new" element={<AdminProductForm />} />
        <Route path="/categories" element={<AdminCategories />} />
        <Route path="/users" element={<AdminUsers />} />
        <Route path="/orders" element={<AdminOrders />} />
        <Route path="/sourcing" element={<AdminSourcing />} />
        <Route path="/restaurants" element={<AdminRestaurants />} />
        <Route path="/hero-slides" element={<AdminHeroSlides />} />
        <Route path="/food-orders" element={<AdminFoodOrders />} />
        <Route path="/payouts" element={<AdminPayouts />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
