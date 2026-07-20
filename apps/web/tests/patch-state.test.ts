import { describe, expect, it } from "vitest";

import { patchTransition } from "../lib/patch-state";

describe("patch review state machine", () => {
  it("reaches verified only through apply and deterministic verification", () => {
    const applying = patchTransition("reviewReady", "APPLY");
    const applied = patchTransition(applying, "APPLIED");
    const verifying = patchTransition(applied, "VERIFY");

    expect(applying).toBe("applying");
    expect(applied).toBe("applied");
    expect(verifying).toBe("verifying");
    expect(patchTransition(verifying, "VERIFIED")).toBe("verified");
  });

  it("does not skip from review to verified", () => {
    expect(patchTransition("reviewReady", "VERIFIED")).toBe("reviewReady");
  });

  it.each([
    ["STALE_ASSET", "staleAsset"],
    ["STALE_PATCH", "stalePatch"],
    ["ALREADY_DECIDED", "alreadyDecided"],
  ] as const)("routes %s to its human-readable terminal state", (event, expected) => {
    expect(patchTransition("applying", event)).toBe(expected);
  });
});
