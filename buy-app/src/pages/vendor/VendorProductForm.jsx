import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useData } from "../../context/DataContext";
import DashboardShell from "../../components/DashboardShell";
import ProductFormFields from "../../components/ProductFormFields";
import { VENDOR_LINKS } from "./VendorDashboard";
import { CATEGORIES } from "../../data/seed";

export default function VendorProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { storeForOwner, products, addProduct, updateProduct } = useData();
  const store = storeForOwner(currentUser.id);
  const existing = id ? products.find((p) => p.id === id) : null;

  const [form, setForm] = useState(
    existing || {
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
    }
  );
  const [error, setError] = useState("");

  if (!store) {
    return (
      <DashboardShell title="Vendor dashboard" subtitle={currentUser.email} links={VENDOR_LINKS}>
        <p className="text-ink/60">Create a store first before adding products.</p>
      </DashboardShell>
    );
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (Number(form.price) <= 0) {
      setError("Price must be greater than zero.");
      return;
    }
    const payload = {
      ...form,
      price: Number(form.price),
      compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : null,
      stock: Number(form.stock),
      storeId: store.id,
      sellerType: "store",
    };
    if (existing) {
      updateProduct(existing.id, payload);
    } else {
      addProduct(payload);
    }
    navigate("/vendor/products");
  }

  return (
    <DashboardShell title="Vendor dashboard" subtitle={store.name} links={VENDOR_LINKS}>
      <div className="bg-white border border-ink/10 rounded-lg p-6 max-w-xl">
        <h2 className="font-display font-semibold mb-4">
          {existing ? "Edit product" : "Add a new product"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <ProductFormFields form={form} setForm={setForm} />
          {error && <p className="text-sm text-coral-600">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" className="bg-mango hover:bg-mango-400 text-indigo-950 font-semibold px-5 py-2.5 rounded-md text-sm">
              {existing ? "Save changes" : "Publish product"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/vendor/products")}
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
