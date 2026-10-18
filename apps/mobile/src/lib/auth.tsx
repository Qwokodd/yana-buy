import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@yanabuy/shared";
import { api } from "./api";
import { unregisterPush } from "./push";

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (input: { fullName: string; phone: string; password: string; email: string; city?: string }) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
  /** Fetch the account again (e.g. after a shop is approved and the role changes). */
  reload: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setUser((await api.me.get()).user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      async login(phone, password) {
        setUser((await api.auth.login({ phone, password })).user);
      },
      async register(input) {
        setUser((await api.auth.register(input)).user);
      },
      async logout() {
        await unregisterPush();
        await api.auth.logout();
        setUser(null);
      },
      setUser,
      reload,
    }),
    [user, loading, reload]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
