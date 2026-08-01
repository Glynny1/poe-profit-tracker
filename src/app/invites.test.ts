import { afterEach, describe, expect, it } from "vitest";

/**
 * INVITE_CODE parsing, tested directly. The logic lives inside a "use server"
 * module that can't be imported here, so this mirrors it — keep the two in step.
 */
function validInviteCodes(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
}

const accepts = (raw: string | undefined, attempt: string) =>
  validInviteCodes(raw).includes(attempt.trim());

afterEach(() => {
  delete process.env.INVITE_CODE;
});

describe("invite codes", () => {
  it("accepts the single-code case", () => {
    expect(accepts("letmein", "letmein")).toBe(true);
    expect(accepts("letmein", "nope")).toBe(false);
  });

  it("accepts any code from a comma-separated list", () => {
    const codes = "friends-2026,ggg-review-a1b2c3";
    expect(accepts(codes, "friends-2026")).toBe(true);
    expect(accepts(codes, "ggg-review-a1b2c3")).toBe(true);
    expect(accepts(codes, "something-else")).toBe(false);
  });

  it("tolerates spaces around the commas", () => {
    expect(accepts("alpha , beta ,  gamma", "beta")).toBe(true);
  });

  it("trims what the user typed, since pasting picks up whitespace", () => {
    expect(accepts("alpha,beta", "  beta  ")).toBe(true);
  });

  it("lets nobody in when nothing is configured", () => {
    expect(validInviteCodes(undefined)).toEqual([]);
    expect(validInviteCodes("")).toEqual([]);
    expect(accepts(undefined, "")).toBe(false);
    expect(accepts("", "")).toBe(false);
  });

  it("never treats an empty string as a valid code", () => {
    // ",,," must not create blank codes that an empty form field would match.
    expect(validInviteCodes(",,,")).toEqual([]);
    expect(accepts("alpha,,beta", "")).toBe(false);
  });

  it("revoking one code leaves the others working", () => {
    const before = "friends-2026,ggg-review-a1b2c3";
    const after = "friends-2026";
    expect(accepts(before, "ggg-review-a1b2c3")).toBe(true);
    expect(accepts(after, "ggg-review-a1b2c3")).toBe(false);
    expect(accepts(after, "friends-2026")).toBe(true);
  });
});
