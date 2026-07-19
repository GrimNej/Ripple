import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SnowflakeClientError,
  SNOWFLAKE_POLL_DELAYS_MS,
  snowflakeApi,
} from "../src/snowflake/client";
import { procedureResponse, queryResponse, testBindings } from "./helpers";

const originalFetch = globalThis.fetch;
let env: CloudflareBindings;

beforeEach(async () => {
  env = await testBindings();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function pending(handle: string, retryAfter = "0"): Response {
  return new Response(JSON.stringify({ statementHandle: handle }), {
    headers: { "content-type": "application/json", "retry-after": retryAfter },
    status: 202,
  });
}

describe("Snowflake SQL API client", () => {
  it("uses the blueprint polling schedule", () => {
    expect(SNOWFLAKE_POLL_DELAYS_MS).toEqual([1000, 2000, 4000, 8000, 10_000]);
  });

  it("submits only a fixed statement with bound values", async () => {
    const upstream = vi.fn<typeof fetch>(() =>
      Promise.resolve(queryResponse([["run_1"]], [{ name: "RUN_ID", type: "text" }])),
    );
    globalThis.fetch = upstream;

    await expect(snowflakeApi.run(env, "run_1", "correlation_1")).resolves.toEqual([
      { runId: "run_1" },
    ]);
    const request = upstream.mock.calls[0];
    expect(request?.[0]).toContain("/api/v2/statements?requestId=");
    const init = request?.[1];
    if (typeof init?.body !== "string") throw new Error("Expected a JSON request body.");
    const body = JSON.parse(init.body) as {
      bindings: Record<string, { value: string }>;
      role: string;
      statement: string;
    };
    expect(body).toMatchObject({
      bindings: { "1": { value: "run_1" } },
      role: "RIPPLE_APP_ROLE",
      statement: "SELECT * FROM RIPPLE.API.RUN_SUMMARY_V WHERE run_id = ?",
    });
    expect(body.statement).not.toContain("run_1");
  });

  it("polls the original 202 statement handle without resubmitting", async () => {
    const handle = "12345678-abcd-abcd-abcd-1234567890ab";
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(pending(handle))
      .mockResolvedValueOnce(procedureResponse({ ok: true, status: "PATCH_APPLIED" }));
    globalThis.fetch = upstream;

    const resultPromise = snowflakeApi.applyPatch(env, {
      approvedContent: "reviewed",
      correlationId: "correlation_1",
      expectedAssetVersionId: "asset_version_1",
      expectedPatchRevision: 1,
      expectedPatchRowVersion: 0,
      idempotencyKey: "12345678901234567890",
      patchId: "patch_1",
      reason: "approved",
    });
    await expect(resultPromise).resolves.toMatchObject({ status: "PATCH_APPLIED" });

    expect(upstream).toHaveBeenCalledTimes(2);
    expect(upstream.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
    expect(upstream.mock.calls[1]?.[0]).toBe(
      `https://${env.SNOWFLAKE_HOST}/api/v2/statements/${handle}`,
    );
  });

  it("treats 429 and 5xx during polling as retryable status checks", async () => {
    const handle = "12345678-abcd-abcd-abcd-1234567890ab";
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(pending(handle))
      .mockResolvedValueOnce(new Response(null, { headers: { "retry-after": "0" }, status: 429 }))
      .mockResolvedValueOnce(new Response(null, { headers: { "retry-after": "0" }, status: 503 }))
      .mockResolvedValueOnce(queryResponse([["2"]], [{ name: "RUN_COUNT", type: "fixed" }]));
    globalThis.fetch = upstream;

    const resultPromise = snowflakeApi.dashboard(env, "correlation_1");
    await expect(resultPromise).resolves.toEqual([{ runCount: 2 }]);
    expect(upstream).toHaveBeenCalledTimes(4);
    expect(upstream.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
  });

  it("recovers from a polling network error on the same handle", async () => {
    const handle = "12345678-abcd-abcd-abcd-1234567890ab";
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(pending(handle))
      .mockRejectedValueOnce(new Error("transient network failure"))
      .mockResolvedValueOnce(queryResponse([["2"]], [{ name: "RUN_COUNT", type: "fixed" }]));
    globalThis.fetch = upstream;

    await expect(snowflakeApi.dashboard(env, "correlation_1")).resolves.toEqual([{ runCount: 2 }]);
    expect(upstream.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
    expect(
      upstream.mock.calls
        .slice(1)
        .every((call) => typeof call[0] === "string" && call[0].endsWith(handle)),
    ).toBe(true);
  });

  it("rejects malformed and oversized upstream JSON", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response("{" + "x".repeat(1_048_576), {
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(snowflakeApi.dashboard(env, "correlation_1")).rejects.toMatchObject({
      code: "UPSTREAM_RESPONSE_TOO_LARGE",
    } satisfies Partial<SnowflakeClientError>);

    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response("not-json", { headers: { "content-type": "application/json" } }),
      ),
    );
    await expect(snowflakeApi.dashboard(env, "correlation_1")).rejects.toMatchObject({
      code: "UPSTREAM_MALFORMED_JSON",
    } satisfies Partial<SnowflakeClientError>);
  });
});
