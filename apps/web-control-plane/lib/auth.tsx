"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api } from "@/lib/api";
import { authEvents } from "@/lib/auth-events";
import { env, isDev } from "@/lib/env";
import { clearSession, getAccessToken, setAccessToken } from "@/lib/session";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

type AuthContextValue = {
  status: AuthStatus;
  login: (token: string) => Promise<void>;
  logout: () => void;
  devToken?: string;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const devToken = env.devSuperToken || undefined;

  const verify = useCallback(async () => {
    try {
      await api.get("/v1/tenants");
      setStatus("authenticated");
    } catch {
      clearSession();
      setStatus("anonymous");
    }
  }, []);

  const login = useCallback(
    async (token: string) => {
      if (!token) {
        throw new Error("Missing token");
      }
      setAccessToken(token);
      await verify();
    },
    [verify],
  );

  const logout = useCallback(() => {
    clearSession();
    setStatus("anonymous");
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setStatus("anonymous");
      return;
    }
    setAccessToken(token);
    verify();
  }, [verify]);

  useEffect(() => {
    const unsubscribe = authEvents.onUnauthorized(() => logout());
    return () => unsubscribe();
  }, [logout]);

  const value = useMemo(
    () => ({
      status,
      login,
      logout,
      devToken: isDev ? devToken : undefined,
    }),
    [status, login, logout, devToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
