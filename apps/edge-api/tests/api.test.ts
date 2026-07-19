import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../src/index";
import { createSession, SESSION_COOKIE } from "../src/security/session";
import {
  authenticatedHeaders,
  procedureResponse,
  queryResponse,
  TEST_ACCESS_CODE,
  testBindings,
} from "./helpers";

const originalFetch = globalThis.fetch;
let env: CloudflareBindings;

beforeEach(async () => {
  env = await testBindings();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function errorBody(
  response: Response,
): Promise<{ error: { code: string; message: string } }> {
  return response.json();
}

describe("edge authentication boundary", () => {
  it("rejects a missing session before Snowflake is contacted", async () => {
    const upstream = vi.fn<typeof fetch>();
    globalThis.fetch = upstream;
    const response = await app.request("https://ripple.test/api/dashboard", {}, env);
    expect(response.status).toBe(401);
    expect((await errorBody(response)).error.code).toBe("SESSION_REQUIRED");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("returns the same visible failure for wrong and malformed login requests", async () => {
    const wrong = await app.request(
      "https://ripple.test/api/auth/login",
      {
        body: JSON.stringify({ accessCode: "wrong" }),
        headers: { "content-type": "application/json", origin: env.APP_ORIGIN },
        method: "POST",
      },
      env,
    );
    const malformed = await app.request(
      "https://ripple.test/api/auth/login",
      {
        body: "not-json",
        headers: { "content-type": "application/json", origin: env.APP_ORIGIN },
        method: "POST",
      },
      env,
    );
    expect(wrong.status).toBe(401);
    expect(malformed.status).toBe(401);
    expect((await errorBody(wrong)).error).toEqual((await errorBody(malformed)).error);
  });

  it("sets the exact protected cookie contract after a correct login", async () => {
    const response = await app.request(
      "https://ripple.test/api/auth/login",
      {
        body: JSON.stringify({ accessCode: TEST_ACCESS_CODE }),
        headers: { "content-type": "application/json", origin: env.APP_ORIGIN },
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(
      /^__Host-ripple_session=.*; Max-Age=1800; Path=\/; HttpOnly; Secure; SameSite=Strict$/u,
    );
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects an expired or tampered session", async () => {
    const expired = await createSession(env, Date.now() - 3_600_000);
    for (const token of [expired.token, `${expired.token.slice(0, -1)}x`]) {
      const response = await app.request(
        "https://ripple.test/api/session",
        { headers: { cookie: `${SESSION_COOKIE}=${token}` } },
        env,
      );
      expect(response.status).toBe(401);
    }
  });
});

describe("edge request defenses", () => {
  it("rejects missing CSRF and wrong Origin before Snowflake is contacted", async () => {
    const upstream = vi.fn<typeof fetch>();
    globalThis.fetch = upstream;
    const auth = await authenticatedHeaders(env, true);
    const body = JSON.stringify({
      idempotencyKey: "12345678901234567890",
      newSnapshotId: "new_snapshot",
      oldSnapshotId: "old_snapshot",
    });

    const missingCsrfHeaders = new Headers(auth.headers);
    missingCsrfHeaders.delete("x-ripple-csrf");
    const missingCsrf = await app.request(
      "https://ripple.test/api/runs",
      { body, headers: missingCsrfHeaders, method: "POST" },
      env,
    );
    const wrongOriginHeaders = new Headers(auth.headers);
    wrongOriginHeaders.set("origin", "https://attacker.test");
    const wrongOrigin = await app.request(
      "https://ripple.test/api/runs",
      { body, headers: wrongOriginHeaders, method: "POST" },
      env,
    );

    expect((await errorBody(missingCsrf)).error.code).toBe("CSRF_REJECTED");
    expect((await errorBody(wrongOrigin)).error.code).toBe("ORIGIN_REJECTED");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("requires literal Origin equality and a JSON content type", async () => {
    const upstream = vi.fn<typeof fetch>();
    globalThis.fetch = upstream;
    const auth = await authenticatedHeaders(env, true);
    const withSlash = new Headers(auth.headers);
    withSlash.set("origin", `${env.APP_ORIGIN}/`);
    const wrongOrigin = await app.request(
      "https://ripple.test/api/runs",
      { body: "{}", headers: withSlash, method: "POST" },
      env,
    );
    const nonJson = new Headers(auth.headers);
    nonJson.set("content-type", "text/plain");
    const wrongContentType = await app.request(
      "https://ripple.test/api/runs",
      { body: "{}", headers: nonJson, method: "POST" },
      env,
    );
    expect((await errorBody(wrongOrigin)).error.code).toBe("ORIGIN_REJECTED");
    expect((await errorBody(wrongContentType)).error.code).toBe("INVALID_REQUEST");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects oversized and invalid JSON bodies before Snowflake is contacted", async () => {
    const upstream = vi.fn<typeof fetch>();
    globalThis.fetch = upstream;
    const auth = await authenticatedHeaders(env, true);
    const oversizedHeaders = new Headers(auth.headers);
    oversizedHeaders.set("content-length", "300001");

    const oversized = await app.request(
      "https://ripple.test/api/runs",
      { body: "{}", headers: oversizedHeaders, method: "POST" },
      env,
    );
    const invalid = await app.request(
      "https://ripple.test/api/runs",
      { body: "not-json", headers: auth.headers, method: "POST" },
      env,
    );

    expect(oversized.status).toBe(413);
    expect((await errorBody(oversized)).error.code).toBe("REQUEST_TOO_LARGE");
    expect(invalid.status).toBe(400);
    expect((await errorBody(invalid)).error.code).toBe("INVALID_REQUEST");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("converts an HTML upstream response into a stable, redacted error", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response("<html>private upstream failure</html>", {
          headers: { "content-type": "text/html" },
          status: 418,
        }),
      ),
    );
    const auth = await authenticatedHeaders(env);
    const response = await app.request(
      "https://ripple.test/api/dashboard",
      { headers: auth.headers },
      env,
    );
    const body = await response.text();
    expect(response.status).toBe(502);
    expect(body).toContain("UPSTREAM_NON_JSON");
    expect(body).not.toContain("private upstream failure");
  });

  it("maps a stale asset result to a stable conflict", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(procedureResponse({ code: "STALE_ASSET_VERSION", ok: false })),
    );
    const auth = await authenticatedHeaders(env, true);
    const response = await app.request(
      "https://ripple.test/api/patches/patch_1/apply",
      {
        body: JSON.stringify({
          approvedContent: "reviewed content",
          expectedAssetVersionId: "version_1",
          expectedPatchRevision: 1,
          expectedPatchRowVersion: 0,
          idempotencyKey: "12345678901234567890",
          reason: "approved",
        }),
        headers: auth.headers,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(409);
    expect(await errorBody(response)).toMatchObject({
      error: {
        code: "STALE_ASSET_VERSION",
        message: "The asset changed after this patch was generated.",
      },
    });
  });

  it("decodes validated query rows without exposing the Snowflake envelope", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        queryResponse(
          [["3", "true"]],
          [
            { name: "RUN_COUNT", type: "fixed" },
            { name: "IS_READY", type: "boolean" },
          ],
        ),
      ),
    );
    const auth = await authenticatedHeaders(env);
    const response = await app.request(
      "https://ripple.test/api/dashboard",
      { headers: auth.headers },
      env,
    );
    expect(await response.json()).toMatchObject({ data: { isReady: true, runCount: 3 }, ok: true });
  });
});
