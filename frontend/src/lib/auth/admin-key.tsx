"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

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

/**
 * Drops everything the previous admin session produced: every cached query and every mutation record.
 * clear() empties both caches. The query cancel stops fetches still in flight under the old key early.
 * A response that arrives after clear() is not written back to the cache either, because clear()
 * detaches the old query objects. The cancel is therefore an early stop, not the only guard.
 */
export function resetAdminSessionCache(queryClient: QueryClient): void {
  advanceAdminSessionGeneration(queryClient);
  void queryClient.cancelQueries();
  queryClient.clear();
}

/**
 * Admin session generation: a non-secret counter, kept in memory only, that advances on every lock
 * and every key change. A mutation records it when it starts, and must not touch the cache when it
 * settles if the value has moved. Comparing keys is not enough: lock then unlock with the same key
 * must still reject the old mutation, so the counter, not the key, is what is compared.
 */
const sessionGenerations = new WeakMap<QueryClient, number>();

export function currentAdminSessionGeneration(queryClient: QueryClient): number {
  return sessionGenerations.get(queryClient) ?? 0;
}

function advanceAdminSessionGeneration(queryClient: QueryClient): void {
  sessionGenerations.set(queryClient, currentAdminSessionGeneration(queryClient) + 1);
}

/** True only if no lock or key change has happened since `generation`, and a key is still stored. */
export function isAdminSessionCurrent(queryClient: QueryClient, generation: number): boolean {
  return generation === currentAdminSessionGeneration(queryClient) && hasStoredAdminKey();
}

function hasStoredAdminKey(): boolean {
  return typeof window !== "undefined" && readStoredKey() !== null;
}

/** Lock: reset the cache, then remove the stored key. Used by the provider and by tests. */
export function lockAdminSession(queryClient: QueryClient): void {
  resetAdminSessionCache(queryClient);
  window.sessionStorage.removeItem(STORAGE_KEY);
  notifyStoredKeyChanged();
}

/** Key change: reset the cache, then store the new key. Used by the provider and by tests. */
export function changeAdminKey(queryClient: QueryClient, key: string): void {
  resetAdminSessionCache(queryClient);
  window.sessionStorage.setItem(STORAGE_KEY, key);
  notifyStoredKeyChanged();
}

/** An empty or missing stored value means "no key", so it can never unlock the console. */
export function normalizeStoredKey(raw: string | null): string | null {
  return raw || null;
}

function readStoredKey(): string | null {
  return normalizeStoredKey(window.sessionStorage.getItem(STORAGE_KEY));
}

function notifyStoredKeyChanged() {
  storageListeners.forEach((listener) => listener());
}

const subscribeNoop = () => () => {};
const getClientReady = () => true;
const getServerReady = () => false;

export function AdminKeyProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  // Server render and hydration report "not ready" and "no key", so the locked state is never
  // flashed before the stored key is read on the client.
  const adminKey = useSyncExternalStore(subscribeToStoredKey, readStoredKey, () => null);
  const hydrated = useSyncExternalStore(subscribeNoop, getClientReady, getServerReady);

  // Only these two callbacks reset the cache, so it is never cleared on render or on mount. Each
  // reset runs before the key is stored or removed, so nothing fetched under the old key survives.
  const setAdminKey = useCallback((key: string) => changeAdminKey(queryClient, key), [queryClient]);

  const clearAdminKey = useCallback(() => lockAdminSession(queryClient), [queryClient]);

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
