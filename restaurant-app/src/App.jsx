import { Routes, Route } from "react-router-dom";
import RestaurantLayout from "./components/RestaurantLayout";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import RestaurantDashboard from "./pages/RestaurantDashboard";
import RestaurantSettings from "./pages/RestaurantSettings";
import MenuItems from "./pages/MenuItems";
import MenuItemForm from "./pages/MenuItemForm";
import FoodOrders from "./pages/FoodOrders";
import Wallet from "./pages/Wallet";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route
        element={
          <ProtectedRoute>
            <RestaurantLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<RestaurantDashboard />} />
        <Route path="/settings" element={<RestaurantSettings />} />
        <Route path="/menu-items" element={<MenuItems />} />
        <Route path="/menu-items/new" element={<MenuItemForm />} />
        <Route path="/menu-items/:id/edit" element={<MenuItemForm />} />
        <Route path="/orders" element={<FoodOrders />} />
        <Route path="/wallet" element={<Wallet />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
