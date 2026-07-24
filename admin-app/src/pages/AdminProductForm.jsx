import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import DashboardShell from "../components/DashboardShell";
import ProductFormFields from "../components/ProductFormFields";
import { ADMIN_LINKS } from "./AdminDashboard";
import { CATEGORIES } from "../data/seed";

export default function AdminProductForm() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { addProduct } = useData();

  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    compareAtPrice: "",
    stock: "",
    category: CATEGORIES[0].id,
    emoji: "🛍️",
    images: [],
    shipsFromChina: false,
    chinaDeliveryDays: 20,
  });
  const [seller, setSeller] = useState({ sellerName: "", sellerPhone: "" });
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (Number(form.price) <= 0) {
      setError("Price must be greater than zero.");
      return;
    }
    if (!seller.sellerName.trim() || !seller.sellerPhone.trim()) {
      setError("Enter the individual seller's name and phone number.");
      return;
    }
    addProduct({
      ...form,
      price: Number(form.price),
      compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : null,
      stock: Number(form.stock),
      sellerType: "individual",
      sellerName: seller.sellerName,
      sellerPhone: seller.sellerPhone,
      listedBy: currentUser.id,
    });
    navigate("/products");
  }

  return (
    <DashboardShell title="Admin dashboard" subtitle={currentUser.email} links={ADMIN_LINKS}>
      <div className="bg-white border border-ink/10 rounded-lg p-6 max-w-xl">
        <h2 className="font-display font-semibold mb-1">List a product for an individual seller</h2>
        <p className="text-xs text-ink/50 mb-4">
          Use this for people who want to sell one-off items without opening a full store.
          The listing will show "sold by [name], individual seller".
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4 p-3 bg-sand rounded-md">
            <div>
              <label className="block text-xs font-medium text-ink/70 mb-1">Seller's full name</label>
              <input
                required
                value={seller.sellerName}
                onChange={(e) => setSeller((s) => ({ ...s, sellerName: e.target.value }))}
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/70 mb-1">Seller's phone number</label>
              <input
                required
                value={seller.sellerPhone}
                onChange={(e) => setSeller((s) => ({ ...s, sellerPhone: e.target.value }))}
                placeholder="+231 770 000 000"
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm outline-none focus:border-teal"
              />
            </div>
          </div>

          <ProductFormFields form={form} setForm={setForm} />

          {error && <p className="text-sm text-coral-600">{error}</p>}

          <div className="flex gap-3">
            <button type="submit" className="bg-mango hover:bg-mango-400 text-indigo-950 font-semibold px-5 py-2.5 rounded-md text-sm">
              Publish listing
            </button>
            <button
              type="button"
              onClick={() => navigate("/products")}
              className="border border-ink/15 font-semibold px-5 py-2.5 rounded-md text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </DashboardShell>
  );
}
