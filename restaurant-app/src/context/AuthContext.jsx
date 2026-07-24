import { createContext, useContext, useEffect, useState } from "react";
import { loadState, saveState, newId } from "../utils/storage";
import { socket } from "../utils/socket";

const AuthContext = createContext(null);

// The users list is shared live (over the socket, via the same realtime
// server as DataContext) with the main Yana Buy site and the admin portal,
// so a vendor account created on the buy app works here immediately with
// the same email/password. The signed-in SESSION stays local to this
// browser/app ("restaurantSession" key), so signing in here does not also
// sign you into the customer/vendor buy app or the admin portal.
export function AuthProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(() => loadState("restaurantSession", null));

  useEffect(() => saveState("restaurantSession", currentUserId), [currentUserId]);

  useEffect(() => {
    function onInit(db) {
      setUsers(db.users);
    }
    function onUserAdd(user) {
      setUsers((prev) => {
        const i = prev.findIndex((u) => u.id === user.id);
        if (i === -1) return [...prev, user];
        const next = [...prev];
        next[i] = user;
        return next;
      });
    }
    function onUserUpdate({ id, patch }) {
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    }

    socket.on("state:init", onInit);
    socket.on("user:add", onUserAdd);
    socket.on("user:update", onUserUpdate);

    return () => {
      socket.off("state:init", onInit);
      socket.off("user:add", onUserAdd);
      socket.off("user:update", onUserUpdate);
    };
  }, []);

  const currentUser = users.find((u) => u.id === currentUserId) || null;

  function login(email, password) {
    const user = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );
    if (!user) return { ok: false, error: "Incorrect email or password." };
    if (user.role !== "restaurant_vendor") {
      return { ok: false, error: "This portal is for restaurant vendor/chef accounts only." };
    }
    setCurrentUserId(user.id);
    return { ok: true, user };
  }

  function logout() {
    setCurrentUserId(null);
  }

  function emailTaken(email) {
    return users.some((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  // Creates a dedicated restaurant_vendor ("chef") account — separate from
  // the shop vendor accounts on the main Yana Buy site, even if someone
  // signs up with the same email address style. After this, they land on
  // Restaurant settings to create their restaurant profile.
  function signup({ name, email, password, phone }) {
    if (emailTaken(email)) {
      return { ok: false, error: "An account with this email already exists." };
    }
    const user = {
      id: newId("chef"),
      name,
      email,
      password,
      phone,
      role: "restaurant_vendor",
      createdAt: new Date().toISOString(),
    };
    setUsers((prev) => [...prev, user]);
    setCurrentUserId(user.id);
    socket.emit("user:add", user);
    return { ok: true, user };
  }

  return (
    <AuthContext.Provider value={{ users, currentUser, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
