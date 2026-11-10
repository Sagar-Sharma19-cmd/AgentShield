import { describe, expect, it } from "vitest";
import { loadReviewerName, REVIEWER_NAME_STORAGE_KEY, saveReviewerName } from "./reviewer-name";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  };
}

describe("reviewer name (session storage)", () => {
  it("round-trips a trimmed name under its key", () => {
    const storage = memoryStorage();
    saveReviewerName("  alice  ", storage);
    expect(storage.values.get(REVIEWER_NAME_STORAGE_KEY)).toBe("alice");
    expect(loadReviewerName(storage)).toBe("alice");
  });

  it("does not store an empty name and returns '' when nothing is stored", () => {
    const storage = memoryStorage();
    saveReviewerName("   ", storage);
    expect(storage.values.size).toBe(0);
    expect(loadReviewerName(storage)).toBe("");
  });

  it("treats unavailable or throwing storage as 'not remembered'", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadReviewerName(throwing)).toBe("");
    expect(() => saveReviewerName("alice", throwing)).not.toThrow();
    expect(loadReviewerName(null)).toBe("");
  });
});
