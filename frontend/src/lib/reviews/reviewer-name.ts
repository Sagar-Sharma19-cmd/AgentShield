/**
 * The reviewer name typed in the decision dialog, remembered for this browser tab only
 * (sessionStorage), so an operator does not retype it for every decision. It is a label the
 * operator chooses, not an identity: the admin key is shared. Storage can be unavailable (private
 * mode, blocked site data), so every access is guarded and failure just means "not remembered".
 */
export const REVIEWER_NAME_STORAGE_KEY = "agentshield.reviewerName";

type NameStorage = Pick<Storage, "getItem" | "setItem">;

function sessionStore(): NameStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadReviewerName(storage: NameStorage | null = sessionStore()): string {
  try {
    return storage?.getItem(REVIEWER_NAME_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveReviewerName(name: string, storage: NameStorage | null = sessionStore()): void {
  const trimmed = name.trim();
  if (trimmed === "") return;
  try {
    storage?.setItem(REVIEWER_NAME_STORAGE_KEY, trimmed);
  } catch {
    // Not remembered; the operator types it again next time.
  }
}
