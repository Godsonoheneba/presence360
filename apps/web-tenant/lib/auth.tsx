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

import { toast } from "sonner";

import { api } from "@/lib/api";
import { authEvents } from "@/lib/auth-events";
import { env, isDev } from "@/lib/env";
import { clearSession, getAccessToken, setAccessToken, setRefreshToken } from "@/lib/session";
import type { LoginResponse, MeResponse } from "@/lib/types";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

type AuthUser = {
  name?: string;
  email?: string;
  roles: string[];
  permissions: string[];
};

type LoginParams = {
  email: string;
  password: string;
  devTokenOverride?: string;
};

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  login: (params: LoginParams) => Promise<void>;
  logout: () => void;
  devToken?: string;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function normalizeUser(payload: MeResponse): AuthUser {
  const basePermissions = payload.permissions ?? [];
  const baseRoles = payload.roles ?? [];
  if (typeof payload.user === "object" && payload.user) {
    return {
      name: payload.user.name,
      email: payload.user.email,
      roles: payload.user.roles ?? baseRoles,
      permissions: payload.user.permissions ?? basePermissions,
    };
  }
  return {
    name: typeof payload.user === "string" ? payload.user : "User",
    roles: baseRoles,
    permissions: basePermissions,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  const devToken = env.devAuthToken || undefined;

  const handleLogout = useCallback(() => {
    clearSession();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const loadMe = useCallback(async (): Promise<boolean> => {
    try {
      const me = await api.get<MeResponse>("/v1/me");
      setUser(normalizeUser(me));
      setStatus("authenticated");
      return true;
    } catch {
      handleLogout();
      return false;
    }
  }, [handleLogout]);

  const login = useCallback(
    async ({ email, password, devTokenOverride }: LoginParams) => {
      setStatus("loading");
      let response: LoginResponse | null = null;
      try {
        response = await api.post<LoginResponse>(
          "/v1/auth/login",
          { email, password },
          { skipAuth: true },
        );
      } catch {
        response = null;
      }

      const token =
        response?.access_token || (isDev ? devTokenOverride || devToken : undefined);
      if (!token) {
        setStatus("anonymous");
        throw new Error("No access token returned. Configure NEXT_PUBLIC_DEV_AUTH_TOKEN.");
      }

      setAccessToken(token);
      if (response?.refresh_token) {
        setRefreshToken(response.refresh_token);
      }

      const verified = await loadMe();
      if (!verified) {
        throw new Error("Unable to verify credentials. Check your token.");
      }
    },
    [devToken, loadMe],
  );

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setStatus("anonymous");
      return;
    }
    setAccessToken(token);
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    const unsubscribe = authEvents.onUnauthorized(() => {
      handleLogout();
      toast.error("Session expired. Please sign in again.");
    });
    return () => unsubscribe();
  }, [handleLogout]);

  const value = useMemo(
    () => ({
      status,
      user,
      login,
      logout: handleLogout,
      devToken,
    }),
    [status, user, login, handleLogout, devToken],
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
