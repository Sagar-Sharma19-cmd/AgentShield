"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

/**
 * Dev-only admin session. The backend has no session/JWT layer for operators (see
 * docs/architecture.md's authentication model) — the admin API key IS the credential, so this
 * stores it for the browser tab only. There is no bypass here: every admin request still goes
 * through the backend's real X-Admin-API-Key check.
 */
const STORAGE_KEY = "agentshield_dev_admin_api_key";

interface AdminKeyContextValue {
  adminKey: string | null;
  /** False until the stored key has been read on the client (avoids a locked-state flash on load). */
  isReady: boolean;
  isUnlocked: boolean;
  setAdminKey: (key: string) => void;
  clearAdminKey: () => void;
}

const AdminKeyContext = createContext<AdminKeyContextValue | null>(null);

// Minimal external store: sessionStorage is the source of truth, and in-tab writes notify
// subscribers. useSyncExternalStore reads it without copying it into component state.
const storageListeners = new Set<() => void>();

function subscribeToStoredKey(onChange: () => void) {
  storageListeners.add(onChange);
  return () => {
    storageListeners.delete(onChange);
  };
}

function readStoredKey(): string | null {
  // An empty stored value is treated as "no key", so it can never unlock the console.
  return window.sessionStorage.getItem(STORAGE_KEY) || null;
}

function notifyStoredKeyChanged() {
  storageListeners.forEach((listener) => listener());
}

const subscribeNoop = () => () => {};
const getClientReady = () => true;
const getServerReady = () => false;

export function AdminKeyProvider({ children }: { children: React.ReactNode }) {
  // Server render and hydration report "not ready" and "no key", so the locked state is never
  // flashed before the stored key is read on the client.
  const adminKey = useSyncExternalStore(subscribeToStoredKey, readStoredKey, () => null);
  const hydrated = useSyncExternalStore(subscribeNoop, getClientReady, getServerReady);

  const setAdminKey = useCallback((key: string) => {
    window.sessionStorage.setItem(STORAGE_KEY, key);
    notifyStoredKeyChanged();
  }, []);

  const clearAdminKey = useCallback(() => {
    window.sessionStorage.removeItem(STORAGE_KEY);
    notifyStoredKeyChanged();
  }, []);

  const value = useMemo<AdminKeyContextValue>(
    () => ({
      adminKey,
      isReady: hydrated,
      isUnlocked: hydrated && adminKey !== null,
      setAdminKey,
      clearAdminKey,
    }),
    [adminKey, hydrated, setAdminKey, clearAdminKey],
  );

  return <AdminKeyContext.Provider value={value}>{children}</AdminKeyContext.Provider>;
}

export function useAdminKey() {
  const ctx = useContext(AdminKeyContext);
  if (!ctx) throw new Error("useAdminKey must be used within AdminKeyProvider");
  return ctx;
}
