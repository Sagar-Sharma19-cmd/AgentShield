import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  DESCRIPTION_MAX_LENGTH,
  describeRegistrationError,
  mapServerFieldErrors,
  validateAgentRegistration,
} from "./registration";

describe("validateAgentRegistration", () => {
  it("accepts a valid name and omits an empty description", () => {
    expect(validateAgentRegistration({ name: "  ci-deployer.v2 ", description: "   " })).toEqual({
      value: { name: "ci-deployer.v2" },
      errors: {},
    });
  });

  it("keeps a trimmed description when one is given", () => {
    expect(validateAgentRegistration({ name: "ci-bot", description: " Builds images " }).value).toEqual({
      name: "ci-bot",
      description: "Builds images",
    });
  });

  it("rejects an empty name", () => {
    const result = validateAgentRegistration({ name: "  ", description: "" });
    expect(result.value).toBeNull();
    expect(result.errors.name).toMatch(/Enter a name/);
  });

  it.each(["A", "Upper-case", "a", "-leading", "has space", "ünicode", "a".repeat(101)])(
    "rejects the name %j, matching the backend pattern",
    (name) => {
      expect(validateAgentRegistration({ name, description: "" }).errors.name).toBeDefined();
    },
  );

  it("accepts a name at the 100-character limit", () => {
    expect(validateAgentRegistration({ name: "a".repeat(100), description: "" }).errors).toEqual({});
  });

  it("rejects a description over the limit", () => {
    const result = validateAgentRegistration({ name: "ok-name", description: "x".repeat(DESCRIPTION_MAX_LENGTH + 1) });
    expect(result.errors.description).toMatch(String(DESCRIPTION_MAX_LENGTH));
  });
});

describe("describeRegistrationError", () => {
  it("never echoes backend text", () => {
    const error = new ApiError(500, {
      timestamp: "t",
      status: 500,
      error: "x",
      message: "SQL detail that must not be shown",
      fieldErrors: {},
    });
    expect(describeRegistrationError(error)).not.toContain("SQL");
  });

  it("explains a conflict as a name clash", () => {
    expect(describeRegistrationError(new ApiError(409, null))).toMatch(/name/);
  });
});

describe("mapServerFieldErrors", () => {
  it("keeps only the fields the form knows", () => {
    const error = new ApiError(400, {
      timestamp: "t",
      status: 400,
      error: "Bad Request",
      message: "Validation failed",
      fieldErrors: { name: "name is bad", other: "ignored" },
    });
    expect(mapServerFieldErrors(error, ["name", "description"] as const)).toEqual({ name: "name is bad" });
  });

  it("returns nothing for non-API errors", () => {
    expect(mapServerFieldErrors(new Error("x"), ["name"] as const)).toEqual({});
  });
});
