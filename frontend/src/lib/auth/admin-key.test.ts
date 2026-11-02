import { describe, expect, it } from "vitest";
import { normalizeStoredKey } from "./admin-key";

describe("normalizeStoredKey", () => {
  it("treats a missing value as no key", () => {
    expect(normalizeStoredKey(null)).toBeNull();
  });

  it("treats an empty string as no key, so it cannot unlock the console", () => {
    expect(normalizeStoredKey("")).toBeNull();
  });

  it("returns a non-empty key unchanged", () => {
    expect(normalizeStoredKey("k-123")).toBe("k-123");
  });
});
