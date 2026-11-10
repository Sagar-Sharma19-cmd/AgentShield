import { describe, expect, it } from "vitest";
import { expiredReason, expiryCountdown, formatAge, formatDuration, isEffectivelyExpired } from "./expiry";

const EXPIRES = "2026-11-10T10:30:00Z";
const at = (iso: string) => Date.parse(iso);

describe("isEffectivelyExpired", () => {
  it("trusts the backend flag", () => {
    expect(isEffectivelyExpired({ expired: true, expiresAt: EXPIRES }, at("2026-11-10T10:00:00Z"))).toBe(true);
  });

  it("also treats the local clock at or past expiresAt as expired", () => {
    expect(isEffectivelyExpired({ expired: false, expiresAt: EXPIRES }, at(EXPIRES))).toBe(true);
    expect(isEffectivelyExpired({ expired: false, expiresAt: EXPIRES }, at("2026-11-10T10:29:59Z"))).toBe(false);
  });

  it("does not expire on an unparseable timestamp alone", () => {
    expect(isEffectivelyExpired({ expired: false, expiresAt: "nope" }, at(EXPIRES))).toBe(false);
  });
});

describe("formatDuration", () => {
  it("rounds down to whole minutes and hours", () => {
    expect(formatDuration(30_000)).toBe("under 1 min");
    expect(formatDuration(12 * 60_000 + 59_000)).toBe("12 min");
    expect(formatDuration(120 * 60_000)).toBe("2 h");
    expect(formatDuration(125 * 60_000)).toBe("2 h 5 min");
  });
});

describe("expiryCountdown", () => {
  it("counts down with the exact time in the label", () => {
    const countdown = expiryCountdown({ expired: false, expiresAt: EXPIRES }, at("2026-11-10T10:18:00Z"));
    expect(countdown.tone).toBe("ok");
    expect(countdown.text).toBe("expires in 12 min");
    expect(countdown.label).toMatch(/^Expires at .+, in 12 min\.$/);
  });

  it("turns into a warning under 5 minutes", () => {
    expect(expiryCountdown({ expired: false, expiresAt: EXPIRES }, at("2026-11-10T10:25:01Z")).tone).toBe("warning");
    expect(expiryCountdown({ expired: false, expiresAt: EXPIRES }, at("2026-11-10T10:25:00Z")).tone).toBe("ok");
  });

  it("says how long ago it expired", () => {
    const countdown = expiryCountdown({ expired: true, expiresAt: EXPIRES }, at("2026-11-10T10:33:00Z"));
    expect(countdown).toMatchObject({ tone: "expired", text: "expired 3 min ago" });
    expect(countdown.label).toMatch(/^Expired at .+, 3 min ago\.$/);
  });

  it("reads plainly 'expired' when the flag is set but the local clock is behind", () => {
    expect(expiryCountdown({ expired: true, expiresAt: EXPIRES }, at("2026-11-10T10:00:00Z")).text).toBe("expired");
  });
});

describe("formatAge", () => {
  it("reads relative to now", () => {
    expect(formatAge("2026-11-10T10:00:00Z", at("2026-11-10T10:00:30Z"))).toBe("just now");
    expect(formatAge("2026-11-10T10:00:00Z", at("2026-11-10T10:07:00Z"))).toBe("7 min ago");
    expect(formatAge("2026-11-10T10:00:00Z", at("2026-11-10T09:00:00Z"))).toBe("just now");
  });
});

describe("expiredReason", () => {
  it("is null while the review can still be acted on", () => {
    expect(expiredReason({ expired: false, expiresAt: EXPIRES }, at("2026-11-10T10:00:00Z"))).toBeNull();
  });

  it("explains why actions are disabled", () => {
    expect(expiredReason({ expired: true, expiresAt: EXPIRES }, at("2026-11-10T10:33:00Z"))).toBe(
      "Expired 3 min ago. It can no longer be started or decided; the agent must send the request again.",
    );
  });
});
