"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Api, User } from "@yanabuy/shared";

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<User>;
  register: (input: { fullName: string; phone: string; password: string; email: string; city?: string }) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Keeps track of who is logged in. `allow` lets an app refuse some roles —
 * the admin app only accepts admins (the server checks this too).
 */
export function AuthProvider({
  api,
  children,
  allow,
  deniedMessage = "This account can't be used here",
}: {
  api: Api;
  children: ReactNode;
  allow?: (user: User) => boolean;
  deniedMessage?: string;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const { user: me } = await api.me.get();
      if (allow && !allow(me)) {
        await api.auth.logout();
        setUser(null);
      } else {
        setUser(me);
      }
    } catch {
      setUser(null);
    }
  }, [api, allow]);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      async login(phone, password) {
        const res = await api.auth.login({ phone, password });
        if (allow && !allow(res.user)) {
          await api.auth.logout();
          throw new Error(deniedMessage);
        }
        setUser(res.user);
        return res.user;
      },
      async register(input) {
        const res = await api.auth.register(input);
        setUser(res.user);
        return res.user;
      },
      async logout() {
        await api.auth.logout();
        setUser(null);
      },
      setUser,
      reload,
    }),
    [api, user, loading, allow, deniedMessage, reload]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
