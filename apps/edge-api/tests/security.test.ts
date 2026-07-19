import { describe, expect, it } from "vitest";

import { constantTimeEqual } from "../src/security/crypto";
import {
  createSession,
  deriveAccessCodeDigest,
  verifyAccessCode,
  verifyCsrf,
  verifySession,
} from "../src/security/session";
import { TEST_ACCESS_CODE, testBindings } from "./helpers";

describe("operator session security", () => {
  it("signs, verifies, expires, and rejects tampered sessions", async () => {
    const env = await testBindings();
    const now = Date.UTC(2026, 6, 19, 12);
    const session = await createSession(env, now);

    const payload = await verifySession(env, session.token, now + 1000);
    if (payload === null) throw new Error("Expected a valid session payload.");
    expect(payload).toMatchObject({ sub: "operator" });
    expect(await verifyCsrf(payload, session.csrfToken)).toBe(true);
    expect(await verifyCsrf(payload, `${session.csrfToken}x`)).toBe(false);
    expect(await verifySession(env, `${session.token.slice(0, -1)}x`, now + 1000)).toBeNull();
    expect(await verifySession(env, session.token, now + 1_800_000)).toBeNull();
  });

  it("stores and compares only the peppered access-code digest", async () => {
    const env = await testBindings();
    expect(await deriveAccessCodeDigest(env, TEST_ACCESS_CODE)).toBe(env.ACCESS_CODE_HMAC);
    expect(await verifyAccessCode(env, TEST_ACCESS_CODE)).toBe(true);
    expect(await verifyAccessCode(env, "wrong-code")).toBe(false);
  });

  it("uses the constant-time comparison wrapper for equal and unequal lengths", () => {
    expect(constantTimeEqual("same", "same")).toBe(true);
    expect(constantTimeEqual("same", "different")).toBe(false);
    expect(constantTimeEqual("short", "shorter")).toBe(false);
  });
});
