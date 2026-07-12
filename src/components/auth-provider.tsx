"use client";

import * as React from "react";
import { getSession, logout as apiLogout } from "@/lib/admin-api";
import type { StoredSession } from "@/lib/mock-data";
import type { StaffUser } from "@/lib/types";

interface AuthContextValue {
  staff: StaffUser | null;
  tenantId: string | null;
  loading: boolean;
  /** Permission codenames granted to the current staff role (owner ⇒ all). */
  can: (codename: string) => boolean;
  setSession: (s: StoredSession | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<StoredSession | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    getSession()
      .then((s) => active && setSession(s))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const logout = React.useCallback(async () => {
    await apiLogout();
    setSession(null);
  }, []);

  const can = React.useCallback(
    (codename: string) => {
      const role = session?.staff.role;
      if (!role) return false;
      if (role.name === "owner") return true; // superuser bypass
      return role.permissions.some((p) => p.codename === codename);
    },
    [session],
  );

  const value: AuthContextValue = {
    staff: session?.staff ?? null,
    tenantId: session?.tenant_id ?? null,
    loading,
    can,
    setSession,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
