import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import { mergeAlertPages, toAlerts, type SecurityAlert } from "./model";
import {
  ALERT_BACKOFF_MS,
  ALERT_POLL_MS,
  ALERT_TOAST_LIMIT,
  EMPTY_TRACKER,
  nextPollDelay,
  planNotifications,
  type AlertTracker,
} from "./tracker";

function row(requestId: string, decision: string, timestamp: string, extra: Record<string, unknown> = {}) {
  return {
    requestId,
    decision,
    timestamp,
    agentId: "ci-devops-agent",
    tool: "docker",
    action: "EXTERNAL_REQUEST",
    resource: "registry.staging.example.test/agentshield-api",
    reason: "Outbound external API call requires human review.",
    riskScore: 60,
    authorizationResult: "AUTHORIZED",
    ...extra,
  };
}

function alert(requestId: string, decision: "DENY" | "REVIEW", minute: number): SecurityAlert {
  const [alertRow] = toAlerts([
    row(requestId, decision, `2026-11-02T10:${String(minute).padStart(2, "0")}:00Z`),
  ]);
  return alertRow;
}

/** Runs the decision the way the monitor does: plan, then carry the tracker forward. */
function poll(tracker: AlertTracker, alerts: SecurityAlert[]) {
  return planNotifications(tracker, alerts);
}

describe("planNotifications: baseline", () => {
  it("does not announce historical alerts on the first successful load", () => {
    const history = [alert("h-1", "DENY", 1), alert("h-2", "REVIEW", 2), alert("h-3", "DENY", 3)];

    const plan = poll(EMPTY_TRACKER, history);

    expect(plan.fresh).toEqual([]);
    expect(plan.toShow).toEqual([]);
    expect(plan.hiddenCount).toBe(0);
    expect(plan.tracker.baselined).toBe(true);
  });

  it("announces only alerts that arrive after the baseline", () => {
    const first = poll(EMPTY_TRACKER, [alert("h-1", "DENY", 1)]);
    const second = poll(first.tracker, [alert("n-1", "DENY", 5), alert("h-1", "DENY", 1)]);

    expect(second.toShow.map((a) => a.requestId)).toEqual(["n-1"]);
  });

  it("keeps the baseline even when the first response is empty", () => {
    const first = poll(EMPTY_TRACKER, []);
    const second = poll(first.tracker, [alert("new-1", "REVIEW", 4)]);

    expect(first.tracker.baselined).toBe(true);
    expect(second.toShow.map((a) => a.requestId)).toEqual(["new-1"]);
  });
});

describe("planNotifications: new events", () => {
  it("a new DENY produces exactly one notification", () => {
    const base = poll(EMPTY_TRACKER, [alert("old", "REVIEW", 1)]);
    const next = poll(base.tracker, [alert("deny-1", "DENY", 9), alert("old", "REVIEW", 1)]);

    expect(next.toShow).toHaveLength(1);
    expect(next.toShow[0].requestId).toBe("deny-1");
    expect(next.toShow[0].decision).toBe("DENY");
    expect(next.hiddenCount).toBe(0);
  });

  it("a new REVIEW produces exactly one notification", () => {
    const base = poll(EMPTY_TRACKER, []);
    const next = poll(base.tracker, [alert("review-1", "REVIEW", 7)]);

    expect(next.toShow).toHaveLength(1);
    expect(next.toShow[0].decision).toBe("REVIEW");
  });

  it("repeated polling with unchanged data does not duplicate notifications", () => {
    const base = poll(EMPTY_TRACKER, []);
    const first = poll(base.tracker, [alert("deny-1", "DENY", 9)]);
    expect(first.toShow).toHaveLength(1);

    let tracker = first.tracker;
    for (let i = 0; i < 5; i += 1) {
      const repeat = poll(tracker, [alert("deny-1", "DENY", 9)]);
      expect(repeat.toShow).toEqual([]);
      expect(repeat.fresh).toEqual([]);
      tracker = repeat.tracker;
    }
  });

  it("the same requestId arriving twice in one response is announced once", () => {
    const base = poll(EMPTY_TRACKER, []);
    const next = poll(base.tracker, [alert("dup", "DENY", 3), alert("dup", "DENY", 3)]);

    expect(next.fresh).toHaveLength(1);
  });

  it("caps individual popups and reports the remainder as hidden", () => {
    const base = poll(EMPTY_TRACKER, []);
    const batch = [1, 2, 3, 4, 5].map((n) => alert(`burst-${n}`, "DENY", n));
    const next = poll(base.tracker, batch);

    expect(next.fresh).toHaveLength(5);
    expect(next.toShow).toHaveLength(ALERT_TOAST_LIMIT);
    expect(next.toShow[0].requestId).toBe("burst-5"); // newest first
    expect(next.hiddenCount).toBe(5 - ALERT_TOAST_LIMIT);
  });

  it("an alert still in the feed is not re-announced when another alert arrives", () => {
    const base = poll(EMPTY_TRACKER, []);
    const seen = poll(base.tracker, [alert("x", "DENY", 2)]);
    const gone = poll(seen.tracker, [alert("y", "DENY", 9)]);
    const back = poll(gone.tracker, [alert("y", "DENY", 9)]);

    expect(gone.toShow.map((a) => a.requestId)).toEqual(["y"]);
    expect(back.toShow).toEqual([]);
  });
});

describe("toAlert: missing and invalid fields", () => {
  it("ignores ALLOW and unknown decisions", () => {
    expect(toAlerts([row("a", "ALLOW", "2026-11-02T10:00:00Z")])).toEqual([]);
    expect(toAlerts([row("b", "PERMIT", "2026-11-02T10:00:00Z")])).toEqual([]);
  });

  it("drops rows without a requestId or a parsable timestamp", () => {
    expect(toAlerts([row("", "DENY", "2026-11-02T10:00:00Z")])).toEqual([]);
    expect(toAlerts([row("c", "DENY", "not-a-date")])).toEqual([]);
    expect(toAlerts([row("d", "DENY", "")])).toEqual([]);
  });

  it("does not throw on non-object input, and returns no alerts for non-array pages", () => {
    expect(toAlerts(null)).toEqual([]);
    expect(toAlerts("junk")).toEqual([]);
    expect(toAlerts([null, 42, "x"])).toEqual([]);
    expect(toAlerts(undefined)).toEqual([]);
  });

  it("keeps a DENY row when optional fields are missing, with safe fallbacks", () => {
    const [minimal] = toAlerts([{ requestId: "m-1", decision: "DENY", timestamp: "2026-11-02T10:00:00Z" }]);

    expect(minimal.requestId).toBe("m-1");
    expect(minimal.agentId).toBe("");
    expect(minimal.tool).toBe("");
    expect(minimal.action).toBeNull();
    expect(minimal.reason).toBe("");
    expect(minimal.policyRiskScore).toBeNull();
    expect(minimal.authorizationResult).toBeNull();
  });

  it("treats a non-numeric riskScore as absent", () => {
    const [bad] = toAlerts([row("r", "REVIEW", "2026-11-02T10:00:00Z", { riskScore: "high" })]);
    const [nan] = toAlerts([row("s", "REVIEW", "2026-11-02T10:00:00Z", { riskScore: Number.NaN })]);

    expect(bad.policyRiskScore).toBeNull();
    expect(nan.policyRiskScore).toBeNull();
  });

  it("a row with missing fields still produces a notification without crashing", () => {
    const base = poll(EMPTY_TRACKER, []);
    const next = poll(base.tracker, toAlerts([{ requestId: "sparse", decision: "DENY", timestamp: "2026-11-02T10:00:00Z" }]));

    expect(next.toShow).toHaveLength(1);
    expect(next.toShow[0].agentId).toBe("");
  });
});

describe("mergeAlertPages", () => {
  it("merges pages newest first, removes duplicates and applies the limit", () => {
    const deny = toAlerts([row("a", "DENY", "2026-11-02T10:05:00Z"), row("b", "DENY", "2026-11-02T10:01:00Z")]);
    const review = toAlerts([row("c", "REVIEW", "2026-11-02T10:03:00Z"), row("a", "DENY", "2026-11-02T10:05:00Z")]);

    const merged = mergeAlertPages([deny, review], 2);

    expect(merged.map((a) => a.requestId)).toEqual(["a", "c"]);
  });
});

describe("nextPollDelay: polling failures", () => {
  it("keeps the normal interval after success", () => {
    expect(nextPollDelay(null)).toBe(ALERT_POLL_MS);
    expect(nextPollDelay(undefined)).toBe(ALERT_POLL_MS);
  });

  it("stops polling when the admin key is rejected, rather than retrying", () => {
    expect(nextPollDelay(new ApiError(401, null))).toBeNull();
    expect(nextPollDelay(new ApiError(403, null))).toBeNull();
  });

  it("backs off after a server or network failure, and keeps polling", () => {
    expect(nextPollDelay(new ApiError(500, null))).toBe(ALERT_BACKOFF_MS);
    expect(nextPollDelay(new TypeError("Failed to fetch"))).toBe(ALERT_BACKOFF_MS);
  });

  it("a failed poll leaves the tracker untouched, so the next success still announces correctly", () => {
    const base = poll(EMPTY_TRACKER, [alert("keep", "REVIEW", 1)]);
    // A failed poll produces no batch, so the monitor never calls planNotifications for it.
    const recovered = poll(base.tracker, [alert("keep", "REVIEW", 1), alert("after-outage", "DENY", 8)]);

    expect(recovered.toShow.map((a) => a.requestId)).toEqual(["after-outage"]);
  });
});
