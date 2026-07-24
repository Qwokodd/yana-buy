import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";

import Home from "./pages/Home";
import CategoryPage from "./pages/CategoryPage";
import ProductDetail from "./pages/ProductDetail";
import StorePage from "./pages/StorePage";
import SearchResults from "./pages/SearchResults";
import Login from "./pages/Login";
import SignupCustomer from "./pages/SignupCustomer";
import SignupVendor from "./pages/SignupVendor";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import OrderSuccess from "./pages/OrderSuccess";
import Sourcing from "./pages/Sourcing";

import Restaurants from "./pages/food/Restaurants";
import RestaurantDetail from "./pages/food/RestaurantDetail";
import FoodCart from "./pages/food/FoodCart";
import FoodCheckout from "./pages/food/FoodCheckout";
import FoodOrderSuccess from "./pages/food/FoodOrderSuccess";

import Profile from "./pages/customer/Profile";
import Orders from "./pages/customer/Orders";
import FoodOrders from "./pages/customer/FoodOrders";

import VendorDashboard from "./pages/vendor/VendorDashboard";
import VendorStoreSetup from "./pages/vendor/VendorStoreSetup";
import VendorProducts from "./pages/vendor/VendorProducts";
import VendorProductForm from "./pages/vendor/VendorProductForm";
import VendorOrders from "./pages/vendor/VendorOrders";
import VendorWallet from "./pages/vendor/VendorWallet";

import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Public */}
        <Route path="/" element={<Home />} />
        <Route path="/category/:id" element={<CategoryPage />} />
        <Route path="/product/:id" element={<ProductDetail />} />
        <Route path="/store/:id" element={<StorePage />} />
        <Route path="/search" element={<SearchResults />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignupCustomer />} />
        <Route path="/sell" element={<SignupVendor />} />
        <Route path="/cart" element={<Cart />} />
        {/* Buyer-facing food browsing stays here -- only restaurant VENDOR
            management moved out to the standalone restaurant-app */}
        <Route path="/food" element={<Restaurants />} />
        <Route path="/food/restaurant/:id" element={<RestaurantDetail />} />
        <Route path="/food/cart" element={<FoodCart />} />

        {/* Customer checkout flow */}
        <Route
          path="/checkout"
          element={
            <ProtectedRoute roles={["customer"]}>
              <Checkout />
            </ProtectedRoute>
          }
        />
        <Route
          path="/order/:id/success"
          element={
            <ProtectedRoute roles={["customer"]}>
              <OrderSuccess />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sourcing"
          element={
            <ProtectedRoute roles={["customer"]}>
              <Sourcing />
            </ProtectedRoute>
          }
        />
        <Route
          path="/food/checkout"
          element={
            <ProtectedRoute roles={["customer"]}>
              <FoodCheckout />
            </ProtectedRoute>
          }
        />
        <Route
          path="/food/order/:id/success"
          element={
            <ProtectedRoute roles={["customer"]}>
              <FoodOrderSuccess />
            </ProtectedRoute>
          }
        />

        {/* Customer account */}
        <Route
          path="/account"
          element={
            <ProtectedRoute roles={["customer"]}>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/account/orders"
          element={
            <ProtectedRoute roles={["customer"]}>
              <Orders />
            </ProtectedRoute>
          }
        />
        <Route
          path="/account/food-orders"
          element={
            <ProtectedRoute roles={["customer"]}>
              <FoodOrders />
            </ProtectedRoute>
          }
        />

        {/* Vendor dashboard — marketplace store only. Restaurant vendor
            management now lives entirely in the standalone restaurant-app
            (see /restaurant-app), linked to from here via DashboardShell. */}
        <Route
          path="/vendor"
          element={
            <ProtectedRoute roles={["vendor"]}>
              <VendorDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vendor/store"
          element={
            <ProtectedRoute roles={["vendor"]}>
              <VendorStoreSetup />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vendor/products"
          element={
            <ProtectedRoute roles={["vendor"]}>
              <VendorProducts />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vendor/products/new"
          element={
            <ProtectedRoute roles={["vendor"]}>
              <VendorProductForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vendor/products/:id/edit"
          element={
            <ProtectedRoute roles={["vendor"]}>
              <VendorProductForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vendor/orders"
          element={
            <ProtectedRoute roles={["vendor"]}>
              <VendorOrders />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vendor/wallet"
          element={
            <ProtectedRoute roles={["vendor"]}>
              <VendorWallet />
            </ProtectedRoute>
          }
        />

        {/* Admin dashboard (yana-buy-admin) and restaurant dashboard
            (yana-buy-restaurant) are managed in separate apps — not part
            of this bundle */}

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
