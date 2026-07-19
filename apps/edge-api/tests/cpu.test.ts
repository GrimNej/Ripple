import { generateKeyPairSync } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { app } from "../src/index";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("edge route CPU preflight", () => {
  it("keeps local p95 wall time below the Worker CPU target with network mocked", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const bindings = {
      SNOWFLAKE_ACCOUNT_LOCATOR: "xy12345",
      SNOWFLAKE_HOST: "xy12345.example.snowflakecomputing.com",
      SNOWFLAKE_PRIVATE_KEY: privateKey.export({ format: "pem", type: "pkcs8" }),
      SNOWFLAKE_PUBLIC_KEY_FINGERPRINT: "test-fingerprint",
      SNOWFLAKE_USER: "RIPPLE_APP_USER",
    } as CloudflareBindings;
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: [[JSON.stringify({ status: "ok" })]],
            statementHandle: "preflight-handle",
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        ),
      );

    for (let index = 0; index < 25; index += 1) {
      const response = await app.request("http://ripple.local/api/preflight/health", {}, bindings);
      expect(response.status).toBe(200);
    }

    const durations: number[] = [];
    for (let index = 0; index < 200; index += 1) {
      const startedAt = performance.now();
      const response = await app.request("http://ripple.local/api/preflight/health", {}, bindings);
      durations.push(performance.now() - startedAt);
      expect(response.status).toBe(200);
    }
    durations.sort((left, right) => left - right);
    const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
    if (p95 === undefined) throw new Error("CPU preflight produced no duration samples.");

    process.stdout.write(
      `${JSON.stringify({ iterations: durations.length, metric: "local_wall_time_proxy", p95Ms: Number(p95.toFixed(3)) })}\n`,
    );
    expect(p95).toBeLessThan(8);
  });
});
