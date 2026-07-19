import { afterEach, describe, expect, it } from "vitest";

import { app } from "../src/index";
import { authenticatedHeaders, procedureResponse, testBindings } from "./helpers";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("edge route CPU preflight", () => {
  it("keeps local p95 wall time below the Worker CPU target with network mocked", async () => {
    const bindings = await testBindings();
    const auth = await authenticatedHeaders(bindings);
    globalThis.fetch = () => Promise.resolve(procedureResponse({ status: "ok" }));

    for (let index = 0; index < 25; index += 1) {
      const response = await app.request(
        "https://ripple.test/api/preflight/health",
        { headers: auth.headers },
        bindings,
      );
      expect(response.status).toBe(200);
    }

    const durations: number[] = [];
    for (let index = 0; index < 200; index += 1) {
      const startedAt = performance.now();
      const response = await app.request(
        "https://ripple.test/api/preflight/health",
        { headers: auth.headers },
        bindings,
      );
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
