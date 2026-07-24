import { createContext, useContext, useEffect, useState } from "react";
import { loadState, saveState } from "../utils/storage";
import { socket } from "../utils/socket";

const AuthContext = createContext(null);

// The users list is shared live (over the socket, via the same realtime
// server as DataContext) with the main Yana Buy site, so a vendor who
// signs up on the buy app shows up here immediately, and an admin editing
// a user here is reflected there right away too. The signed-in SESSION
// stays local to this browser/app ("adminSession" key), so signing in
// here does not also sign you into the customer/vendor site.
export function AuthProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(() => loadState("adminSession", null));

  useEffect(() => saveState("adminSession", currentUserId), [currentUserId]);

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
    if (user.role !== "admin") {
      return { ok: false, error: "This portal is for administrators only." };
    }
    setCurrentUserId(user.id);
    return { ok: true, user };
  }

  function logout() {
    setCurrentUserId(null);
  }

  function updateUser(id, patch) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    socket.emit("user:update", { id, patch });
  }

  return (
    <AuthContext.Provider value={{ users, currentUser, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
