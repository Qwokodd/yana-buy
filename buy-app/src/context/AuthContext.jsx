import { createContext, useContext, useEffect, useState } from "react";
import { loadState, saveState, newId } from "../utils/storage";
import { socket } from "../utils/socket";

const AuthContext = createContext(null);

// The users list is shared live (over the socket, via the same realtime
// server as DataContext) with the admin app, so a vendor who signs up
// here shows up in the admin dashboard immediately. The signed-in SESSION
// stays local to this browser/app ("session" key), so signing in here
// does not also sign you into the admin portal.
export function AuthProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(() => loadState("session", null));

  useEffect(() => saveState("session", currentUserId), [currentUserId]);

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
    setCurrentUserId(user.id);
    return { ok: true, user };
  }

  function logout() {
    setCurrentUserId(null);
  }

  function emailTaken(email) {
    return users.some((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  function signup({ name, email, password, phone, role = "customer" }) {
    if (emailTaken(email)) {
      return { ok: false, error: "An account with this email already exists." };
    }
    const user = {
      id: newId("user"),
      name,
      email,
      password,
      phone,
      role,
      createdAt: new Date().toISOString(),
    };
    setUsers((prev) => [...prev, user]);
    setCurrentUserId(user.id);
    socket.emit("user:add", user);
    return { ok: true, user };
  }

  function updateUser(id, patch) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    socket.emit("user:update", { id, patch });
  }

  return (
    <AuthContext.Provider
      value={{ users, currentUser, login, logout, signup, emailTaken, updateUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
