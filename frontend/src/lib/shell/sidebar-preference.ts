/**
 * Persists the sidebar's collapsed state in localStorage. Every storage access is wrapped in
 * try/catch: storage can be missing (server), blocked (privacy settings) or full, and the console
 * must still render, defaulting to the expanded sidebar. Only "true"/"false" is stored; no other data.
 */

export const SIDEBAR_STORAGE_KEY = "agentshield-sidebar-collapsed";

/** The subset of the Storage interface used here, so tests can pass a fake. */
export type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

/** Reads the stored preference. Anything other than the exact string "true" means expanded. */
export function readSidebarCollapsed(storage: PreferenceStorage | null | undefined): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/** Stores the preference. Returns false if it could not be saved (the UI still updates in memory). */
export function writeSidebarCollapsed(storage: PreferenceStorage | null | undefined, collapsed: boolean): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

/** window.localStorage, or null where reading the property itself throws (some sandboxed iframes). */
export function browserLocalStorage(): PreferenceStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
