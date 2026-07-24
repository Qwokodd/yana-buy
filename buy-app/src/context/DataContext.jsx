import { createContext, useContext, useEffect, useState } from "react";
import { newId } from "../utils/storage";
import { socket } from "../utils/socket";

const DataContext = createContext(null);

// Data now lives on the shared realtime server (see /server), not in this
// browser's localStorage. On connect we get the full current state, and
// after that every add/update/delete made in EITHER app (buy app or admin
// app, any tab) is pushed here live over the socket -- that's what makes
// products/vendors/orders/menus show up instantly without a refresh.
export function DataProvider({ children }) {
  const [categories, setCategories] = useState([]);
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [sourcingRequests, setSourcingRequests] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [foodOrders, setFoodOrders] = useState([]);
  const [vendorWallets, setVendorWallets] = useState({});
  const [payoutRequests, setPayoutRequests] = useState([]);
  const [heroSlides, setHeroSlides] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const upsertIn = (setter) => (item) =>
      setter((prev) => {
        const i = prev.findIndex((x) => x.id === item.id);
        if (i === -1) return [item, ...prev];
        const next = [...prev];
        next[i] = item;
        return next;
      });
    const updateIn = (setter) => ({ id, patch }) =>
      setter((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const removeIn = (setter) => ({ id }) =>
      setter((prev) => prev.filter((x) => x.id !== id));

    function onInit(db) {
      setCategories(db.categories);
      setStores(db.stores);
      setProducts(db.products);
      setOrders(db.orders);
      setSourcingRequests(db.sourcingRequests || []);
      setRestaurants(db.restaurants || []);
      setMenuItems(db.menuItems || []);
      setFoodOrders(db.foodOrders || []);
      setVendorWallets(db.vendorWallets || {});
      setPayoutRequests(db.payoutRequests || []);
      setHeroSlides((db.heroSlides || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      setReady(true);
    }

    const onCategoryAdd = upsertIn(setCategories);
    const onCategoryUpdate = updateIn(setCategories);
    const onCategoryDelete = removeIn(setCategories);

    const onStoreCreate = upsertIn(setStores);
    const onStoreUpdate = updateIn(setStores);
    const onStoreDelete = removeIn(setStores);

    const onProductAdd = upsertIn(setProducts);
    const onProductUpdate = updateIn(setProducts);
    const onProductDelete = removeIn(setProducts);
    const onProductDecrementStock = ({ items }) =>
      setProducts((prev) =>
        prev.map((p) => {
          const line = items.find((i) => i.productId === p.id);
          if (!line) return p;
          return { ...p, stock: Math.max(0, p.stock - line.qty) };
        })
      );

    const onOrderCreate = upsertIn(setOrders);
    const onOrderUpdateStatus = ({ id, status }) =>
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));

    const onSourcingCreate = upsertIn(setSourcingRequests);
    const onSourcingUpdate = updateIn(setSourcingRequests);
    const onSourcingDelete = removeIn(setSourcingRequests);

    const onRestaurantCreate = upsertIn(setRestaurants);
    const onRestaurantUpdate = updateIn(setRestaurants);
    const onRestaurantDelete = removeIn(setRestaurants);

    const onMenuItemAdd = upsertIn(setMenuItems);
    const onMenuItemUpdate = updateIn(setMenuItems);
    const onMenuItemDelete = removeIn(setMenuItems);

    const onFoodOrderCreate = upsertIn(setFoodOrders);
    const onFoodOrderUpdateStatus = ({ id, status }) =>
      setFoodOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));

    // Wallet balances and payout requests are mutated server-side (not part
    // of any single emitted event's payload), so the server just pushes the
    // full current picture after anything that could affect them.
    const onWalletSync = (wallets) => setVendorWallets(wallets || {});
    const onPayoutSync = (requests) => setPayoutRequests(requests || []);

    const onHeroSlideAdd = upsertIn(setHeroSlides);
    const onHeroSlideUpdate = updateIn(setHeroSlides);
    const onHeroSlideDelete = removeIn(setHeroSlides);
    const onHeroSlideReorder = ({ slides }) => setHeroSlides(slides);

    socket.on("state:init", onInit);
    socket.on("category:add", onCategoryAdd);
    socket.on("category:update", onCategoryUpdate);
    socket.on("category:delete", onCategoryDelete);
    socket.on("store:create", onStoreCreate);
    socket.on("store:update", onStoreUpdate);
    socket.on("store:delete", onStoreDelete);
    socket.on("product:add", onProductAdd);
    socket.on("product:update", onProductUpdate);
    socket.on("product:delete", onProductDelete);
    socket.on("product:decrementStock", onProductDecrementStock);
    socket.on("order:create", onOrderCreate);
    socket.on("order:updateStatus", onOrderUpdateStatus);
    socket.on("sourcing:create", onSourcingCreate);
    socket.on("sourcing:update", onSourcingUpdate);
    socket.on("sourcing:delete", onSourcingDelete);
    socket.on("restaurant:create", onRestaurantCreate);
    socket.on("restaurant:update", onRestaurantUpdate);
    socket.on("restaurant:delete", onRestaurantDelete);
    socket.on("menuItem:add", onMenuItemAdd);
    socket.on("menuItem:update", onMenuItemUpdate);
    socket.on("menuItem:delete", onMenuItemDelete);
    socket.on("foodOrder:create", onFoodOrderCreate);
    socket.on("foodOrder:updateStatus", onFoodOrderUpdateStatus);
    socket.on("wallet:sync", onWalletSync);
    socket.on("payout:sync", onPayoutSync);
    socket.on("heroSlide:add", onHeroSlideAdd);
    socket.on("heroSlide:update", onHeroSlideUpdate);
    socket.on("heroSlide:delete", onHeroSlideDelete);
    socket.on("heroSlide:reorder", onHeroSlideReorder);

    return () => {
      socket.off("state:init", onInit);
      socket.off("category:add", onCategoryAdd);
      socket.off("category:update", onCategoryUpdate);
      socket.off("category:delete", onCategoryDelete);
      socket.off("store:create", onStoreCreate);
      socket.off("store:update", onStoreUpdate);
      socket.off("store:delete", onStoreDelete);
      socket.off("product:add", onProductAdd);
      socket.off("product:update", onProductUpdate);
      socket.off("product:delete", onProductDelete);
      socket.off("product:decrementStock", onProductDecrementStock);
      socket.off("order:create", onOrderCreate);
      socket.off("order:updateStatus", onOrderUpdateStatus);
      socket.off("sourcing:create", onSourcingCreate);
      socket.off("sourcing:update", onSourcingUpdate);
      socket.off("sourcing:delete", onSourcingDelete);
      socket.off("restaurant:create", onRestaurantCreate);
      socket.off("restaurant:update", onRestaurantUpdate);
      socket.off("restaurant:delete", onRestaurantDelete);
      socket.off("menuItem:add", onMenuItemAdd);
      socket.off("menuItem:update", onMenuItemUpdate);
      socket.off("menuItem:delete", onMenuItemDelete);
      socket.off("foodOrder:create", onFoodOrderCreate);
      socket.off("foodOrder:updateStatus", onFoodOrderUpdateStatus);
      socket.off("wallet:sync", onWalletSync);
      socket.off("payout:sync", onPayoutSync);
      socket.off("heroSlide:add", onHeroSlideAdd);
      socket.off("heroSlide:update", onHeroSlideUpdate);
      socket.off("heroSlide:delete", onHeroSlideDelete);
      socket.off("heroSlide:reorder", onHeroSlideReorder);
    };
  }, []);

  // ---- Categories ----
  function addCategory(cat) {
    const newCat = { id: newId("cat"), ...cat };
    setCategories((prev) => [...prev, newCat]);
    socket.emit("category:add", newCat);
    return newCat;
  }
  function updateCategory(id, patch) {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    socket.emit("category:update", { id, patch });
  }
  function deleteCategory(id) {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    socket.emit("category:delete", { id });
  }

  // ---- Stores ----
  function createStore(store) {
    const newStore = {
      id: newId("store"),
      status: "pending",
      createdAt: new Date().toISOString(),
      ...store,
    };
    setStores((prev) => [...prev, newStore]);
    socket.emit("store:create", newStore);
    return newStore;
  }
  function updateStore(id, patch) {
    setStores((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    socket.emit("store:update", { id, patch });
  }
  function deleteStore(id) {
    setStores((prev) => prev.filter((s) => s.id !== id));
    socket.emit("store:delete", { id });
  }
  function storeForOwner(ownerId) {
    return stores.find((s) => s.ownerId === ownerId) || null;
  }

  // ---- Products ----
  function addProduct(product) {
    const newProduct = {
      id: newId("prod"),
      status: "active",
      rating: 0,
      reviews: 0,
      createdAt: new Date().toISOString(),
      ...product,
    };
    setProducts((prev) => [newProduct, ...prev]);
    socket.emit("product:add", newProduct);
    return newProduct;
  }
  function updateProduct(id, patch) {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    socket.emit("product:update", { id, patch });
  }
  function deleteProduct(id) {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    socket.emit("product:delete", { id });
  }
  function decrementStock(items) {
    setProducts((prev) =>
      prev.map((p) => {
        const line = items.find((i) => i.productId === p.id);
        if (!line) return p;
        return { ...p, stock: Math.max(0, p.stock - line.qty) };
      })
    );
    socket.emit("product:decrementStock", { items });
  }

  // ---- Orders ----
  function createOrder(order) {
    const newOrder = {
      id: newId("order"),
      status: "paid",
      createdAt: new Date().toISOString(),
      ...order,
    };
    setOrders((prev) => [newOrder, ...prev]);
    decrementStock(order.items);
    socket.emit("order:create", newOrder);
    return newOrder;
  }
  function updateOrderStatus(id, status) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    socket.emit("order:updateStatus", { id, status });
  }

  // ---- China sourcing requests ----
  function createSourcingRequest(request) {
    const newRequest = {
      id: newId("src"),
      status: "pending", // pending -> quoted -> accepted -> fulfilled (or rejected)
      quotedPrice: null,
      quotedShippingDays: null,
      adminNotes: "",
      createdAt: new Date().toISOString(),
      ...request,
    };
    setSourcingRequests((prev) => [newRequest, ...prev]);
    socket.emit("sourcing:create", newRequest);
    return newRequest;
  }
  function updateSourcingRequest(id, patch) {
    setSourcingRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    socket.emit("sourcing:update", { id, patch });
  }
  function deleteSourcingRequest(id) {
    setSourcingRequests((prev) => prev.filter((r) => r.id !== id));
    socket.emit("sourcing:delete", { id });
  }

  // ---- Restaurants ----
  function createRestaurant(restaurant) {
    const newRestaurant = {
      id: newId("resto"),
      status: "pending",
      createdAt: new Date().toISOString(),
      ...restaurant,
    };
    setRestaurants((prev) => [...prev, newRestaurant]);
    socket.emit("restaurant:create", newRestaurant);
    return newRestaurant;
  }
  function updateRestaurant(id, patch) {
    setRestaurants((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    socket.emit("restaurant:update", { id, patch });
  }
  function deleteRestaurant(id) {
    setRestaurants((prev) => prev.filter((r) => r.id !== id));
    socket.emit("restaurant:delete", { id });
  }
  function restaurantForOwner(ownerId) {
    return restaurants.find((r) => r.ownerId === ownerId) || null;
  }

  // ---- Menu items ----
  function addMenuItem(item) {
    const newItem = {
      id: newId("menu"),
      available: true,
      createdAt: new Date().toISOString(),
      ...item,
    };
    setMenuItems((prev) => [newItem, ...prev]);
    socket.emit("menuItem:add", newItem);
    return newItem;
  }
  function updateMenuItem(id, patch) {
    setMenuItems((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    socket.emit("menuItem:update", { id, patch });
  }
  function deleteMenuItem(id) {
    setMenuItems((prev) => prev.filter((m) => m.id !== id));
    socket.emit("menuItem:delete", { id });
  }

  // ---- Food orders ----
  function createFoodOrder(order) {
    const newOrder = {
      id: newId("forder"),
      status: "placed", // placed -> preparing -> out_for_delivery -> delivered (or cancelled)
      createdAt: new Date().toISOString(),
      ...order,
    };
    setFoodOrders((prev) => [newOrder, ...prev]);
    socket.emit("foodOrder:create", newOrder);
    return newOrder;
  }
  function updateFoodOrderStatus(id, status) {
    setFoodOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    socket.emit("foodOrder:updateStatus", { id, status });
  }

  // ---- Vendor wallet & payouts ----
  // Commission math itself happens server-side (see /server/index.js) so it
  // can never be bypassed by a client; this app only reads the resulting
  // balance and requests cash-outs against it.
  function walletForVendor(vendorId) {
    return (
      vendorWallets[vendorId] || {
        vendorId,
        balance: 0,
        totalSales: 0,
        totalCommission: 0,
        totalEarned: 0,
      }
    );
  }
  function payoutsForVendor(vendorId) {
    return payoutRequests.filter((r) => r.vendorId === vendorId);
  }
  function requestPayout({ vendorId, amount, method, destination }) {
    socket.emit("payout:request", {
      id: newId("payout"),
      vendorId,
      amount,
      method,
      destination,
      createdAt: new Date().toISOString(),
    });
  }
  function updatePayoutStatus(id, status) {
    socket.emit("payout:updateStatus", { id, status });
  }


  // ---- Homepage hero slides ----
  function addHeroSlide(slide) {
    const newSlide = {
      id: newId("hero"),
      active: true,
      order: heroSlides.length,
      createdAt: new Date().toISOString(),
      ...slide,
    };
    setHeroSlides((prev) => [...prev, newSlide]);
    socket.emit("heroSlide:add", newSlide);
    return newSlide;
  }
  function updateHeroSlide(id, patch) {
    setHeroSlides((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    socket.emit("heroSlide:update", { id, patch });
  }
  function deleteHeroSlide(id) {
    setHeroSlides((prev) => prev.filter((s) => s.id !== id));
    socket.emit("heroSlide:delete", { id });
  }
  function reorderHeroSlides(orderedIds) {
    setHeroSlides((prev) => {
      const byId = Object.fromEntries(prev.map((s) => [s.id, s]));
      const next = orderedIds.map((id, i) => ({ ...byId[id], order: i }));
      socket.emit("heroSlide:reorder", { slides: next });
      return next;
    });
  }

  const value = {
    categories,
    stores,
    products,
    orders,
    sourcingRequests,
    restaurants,
    menuItems,
    foodOrders,
    vendorWallets,
    payoutRequests,
    heroSlides,
    addHeroSlide,
    updateHeroSlide,
    deleteHeroSlide,
    reorderHeroSlides,
    walletForVendor,
    payoutsForVendor,
    requestPayout,
    updatePayoutStatus,
    ready,
    addCategory,
    updateCategory,
    deleteCategory,
    createStore,
    updateStore,
    deleteStore,
    storeForOwner,
    addProduct,
    updateProduct,
    deleteProduct,
    createOrder,
    updateOrderStatus,
    createSourcingRequest,
    updateSourcingRequest,
    deleteSourcingRequest,
    createRestaurant,
    updateRestaurant,
    deleteRestaurant,
    restaurantForOwner,
    addMenuItem,
    updateMenuItem,
    deleteMenuItem,
    createFoodOrder,
    updateFoodOrderStatus,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
