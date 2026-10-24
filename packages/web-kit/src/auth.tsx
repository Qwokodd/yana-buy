"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { needsCode, type Api, type AuthResponse, type LoginChallenge, type User } from "@yanabuy/shared";

/** Either logged in, or a 6-digit code is needed first (show <LoginCode>). */
export type LoginStep = { user: User; challenge?: undefined; welcomeBack?: boolean } | { user?: undefined; challenge: LoginChallenge };

interface AuthValue {
  user: User | null;
  loading: boolean;
  /** `login` is the phone number or email they typed. */
  login: (login: string, password: string) => Promise<LoginStep>;
  /** Finishes a login (or an old-store account claim) with the 6-digit code. */
  verifyCode: (input: { challengeId: string; code: string; trustDevice?: boolean }) => Promise<AuthResponse>;
  register: (input: { fullName: string; phone?: string; email?: string; password: string; city?: string }) => Promise<LoginStep>;
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
      async login(login, password) {
        const res = await api.auth.login({ login, password });
        if (needsCode(res)) return { challenge: res };
        if (allow && !allow(res.user)) {
          await api.auth.logout();
          throw new Error(deniedMessage);
        }
        setUser(res.user);
        return { user: res.user };
      },
      async verifyCode(input) {
        const res = await api.auth.verifyLogin(input);
        if (allow && !allow(res.user)) {
          await api.auth.logout();
          throw new Error(deniedMessage);
        }
        setUser(res.user);
        return res;
      },
      async register(input) {
        const res = await api.auth.register(input);
        if (needsCode(res)) return { challenge: res };
        setUser(res.user);
        return { user: res.user, welcomeBack: res.welcomeBack };
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
