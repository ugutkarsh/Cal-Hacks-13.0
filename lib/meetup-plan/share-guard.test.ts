import { describe, expect, it } from "vitest";

/**
 * Share endpoint guards (mirrored here for unit coverage without HTTP).
 * Unauthorized / missing confirm must never create posts.
 */
function assertShareAllowed(body: {
  confirm?: unknown;
  signedIn?: boolean;
}): { ok: true } | { ok: false; error: string; status: number } {
  if (!body.signedIn) {
    return { ok: false, error: "Sign in required to share a plan", status: 401 };
  }
  if (body.confirm !== true) {
    return {
      ok: false,
      error:
        "Explicit confirm:true is required to share a plan as a community post",
      status: 400,
    };
  }
  return { ok: true };
}

describe("meetup plan share guards", () => {
  it("rejects unsigned users", () => {
    const r = assertShareAllowed({ confirm: true, signedIn: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("rejects missing explicit confirm", () => {
    const r = assertShareAllowed({ signedIn: true, confirm: false });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.error).toMatch(/confirm/i);
    }
  });

  it("allows signed-in + confirm", () => {
    expect(assertShareAllowed({ signedIn: true, confirm: true }).ok).toBe(true);
  });
});
