import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { needsCode, type AuthResponse, type LoginChallenge, type User } from "@yanabuy/shared";
import { api } from "./api";
import { unregisterPush } from "./push";

interface AuthValue {
  user: User | null;
  loading: boolean;
  /** `login` is the phone number or email they typed. A challenge = show the code screen next. */
  login: (login: string, password: string) => Promise<LoginChallenge | null>;
  /** Finishes a login (or an old-store account claim) with the 6-digit code. */
  verifyCode: (input: { challengeId: string; code: string; trustDevice?: boolean }) => Promise<AuthResponse>;
  register: (input: { fullName: string; phone?: string; email?: string; password: string; city?: string }) => Promise<LoginChallenge | null>;
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
      async login(login, password) {
        const res = await api.auth.login({ login, password });
        if (needsCode(res)) return res;
        setUser(res.user);
        return null;
      },
      async verifyCode(input) {
        const res = await api.auth.verifyLogin(input);
        setUser(res.user);
        return res;
      },
      async register(input) {
        const res = await api.auth.register(input);
        if (needsCode(res)) return res;
        setUser(res.user);
        return null;
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
