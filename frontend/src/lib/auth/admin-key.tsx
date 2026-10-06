"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Dev-only admin session. The backend has no session/JWT layer for operators (see
 * docs/architecture.md's authentication model) — the admin API key IS the credential, so this
 * stores it for the browser tab only. There is no bypass here: every admin request still goes
 * through the backend's real X-Admin-API-Key check.
 */
const STORAGE_KEY = "agentshield_dev_admin_api_key";

interface AdminKeyContextValue {
  adminKey: string | null;
  isUnlocked: boolean;
  setAdminKey: (key: string) => void;
  clearAdminKey: () => void;
}

const AdminKeyContext = createContext<AdminKeyContextValue | null>(null);

export function AdminKeyProvider({ children }: { children: React.ReactNode }) {
  const [adminKey, setAdminKeyState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored) setAdminKeyState(stored);
    setHydrated(true);
  }, []);

  const setAdminKey = useCallback((key: string) => {
    window.sessionStorage.setItem(STORAGE_KEY, key);
    setAdminKeyState(key);
  }, []);

  const clearAdminKey = useCallback(() => {
    window.sessionStorage.removeItem(STORAGE_KEY);
    setAdminKeyState(null);
  }, []);

  const value = useMemo<AdminKeyContextValue>(
    () => ({ adminKey, isUnlocked: hydrated && adminKey !== null, setAdminKey, clearAdminKey }),
    [adminKey, hydrated, setAdminKey, clearAdminKey],
  );

  return <AdminKeyContext.Provider value={value}>{children}</AdminKeyContext.Provider>;
}

export function useAdminKey() {
  const ctx = useContext(AdminKeyContext);
  if (!ctx) throw new Error("useAdminKey must be used within AdminKeyProvider");
  return ctx;
}
