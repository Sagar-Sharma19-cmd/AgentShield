import { describe, expect, it } from "vitest";
import {
  browserLocalStorage,
  readSidebarCollapsed,
  SIDEBAR_STORAGE_KEY,
  writeSidebarCollapsed,
  type PreferenceStorage,
} from "./sidebar-preference";

function memoryStorage(initial: Record<string, string> = {}): PreferenceStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const throwingStorage: PreferenceStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("readSidebarCollapsed", () => {
  it("defaults to expanded when nothing is stored", () => {
    expect(readSidebarCollapsed(memoryStorage())).toBe(false);
  });

  it("reads a stored collapsed state", () => {
    expect(readSidebarCollapsed(memoryStorage({ [SIDEBAR_STORAGE_KEY]: "true" }))).toBe(true);
    expect(readSidebarCollapsed(memoryStorage({ [SIDEBAR_STORAGE_KEY]: "false" }))).toBe(false);
  });

  it("treats unexpected values as expanded", () => {
    expect(readSidebarCollapsed(memoryStorage({ [SIDEBAR_STORAGE_KEY]: "yes" }))).toBe(false);
  });

  it("falls back to expanded when storage is missing or throws", () => {
    expect(readSidebarCollapsed(null)).toBe(false);
    expect(readSidebarCollapsed(undefined)).toBe(false);
    expect(readSidebarCollapsed(throwingStorage)).toBe(false);
  });
});

describe("writeSidebarCollapsed", () => {
  it("round-trips through storage", () => {
    const storage = memoryStorage();
    expect(writeSidebarCollapsed(storage, true)).toBe(true);
    expect(storage.data.get(SIDEBAR_STORAGE_KEY)).toBe("true");
    expect(readSidebarCollapsed(storage)).toBe(true);
    writeSidebarCollapsed(storage, false);
    expect(readSidebarCollapsed(storage)).toBe(false);
  });

  it("reports failure instead of throwing", () => {
    expect(writeSidebarCollapsed(throwingStorage, true)).toBe(false);
    expect(writeSidebarCollapsed(null, true)).toBe(false);
  });
});

describe("browserLocalStorage", () => {
  it("returns null outside the browser", () => {
    expect(browserLocalStorage()).toBeNull();
  });
});
