import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runScheduledMonitoring } from "../src/monitoring";
import { queryResponse, testBindings } from "./helpers";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("scheduled source monitoring", () => {
  it("queries only the bounded due-monitor and notification views", async () => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(queryResponse([], [{ name: "MONITOR_ID", type: "text" }]))
      .mockResolvedValueOnce(queryResponse([], [{ name: "CHECK_ID", type: "text" }]));
    globalThis.fetch = upstream;

    await runScheduledMonitoring(await testBindings());

    expect(upstream).toHaveBeenCalledTimes(2);
    const statements = upstream.mock.calls.map((call) => {
      const body = call[1]?.body;
      if (typeof body !== "string") throw new Error("EXPECTED_STRING_BODY");
      return (JSON.parse(body) as { statement: string }).statement;
    });
    expect(statements).toEqual([
      "SELECT * FROM RIPPLE.API.MONITOR_DUE_V ORDER BY created_at LIMIT 10",
      "SELECT * FROM RIPPLE.API.MONITOR_NOTIFICATION_V ORDER BY checked_at LIMIT 10",
    ]);
  });
});
