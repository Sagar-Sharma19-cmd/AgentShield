"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  browserLocalStorage,
  readSidebarCollapsed,
  SIDEBAR_STORAGE_KEY,
  writeSidebarCollapsed,
} from "@/lib/shell/sidebar-preference";

/*
 * Small external store over localStorage, in the same style as the admin-key store: storage is the
 * source of truth, in-tab writes notify subscribers, and the "storage" event syncs other tabs.
 * If storage cannot be written, the in-memory value still changes for this tab.
 */
const listeners = new Set<() => void>();
let memoryFallback: boolean | null = null;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SIDEBAR_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): boolean {
  return memoryFallback ?? readSidebarCollapsed(browserLocalStorage());
}

const getServerSnapshot = () => false;

/** Collapsed-to-rail state of the desktop sidebar, persisted per browser. */
export function useSidebarCollapsed(): [collapsed: boolean, setCollapsed: (collapsed: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setCollapsed = useCallback((next: boolean) => {
    memoryFallback = writeSidebarCollapsed(browserLocalStorage(), next) ? null : next;
    listeners.forEach((listener) => listener());
  }, []);

  return [collapsed, setCollapsed];
}
