import { describe, expect, it } from "vitest";

import { graphRowSchema } from "../lib/contracts";

describe("graph response contract", () => {
  it("normalizes the Snowflake finding status projection", () => {
    const row = graphRowSchema.parse({
      assetId: "asset-guide",
      assetTitle: "Installation guide",
      assetType: "MARKDOWN",
      changeAtomId: "atom-runtime",
      changeType: "VERSION_REQUIREMENT",
      criticality: "HIGH",
      findingId: "finding-guide",
      findingStatus: "CONFIRMED",
      impactType: "OUTDATED_REQUIREMENT",
      newClaim: "3.12",
      oldClaim: "3.10",
      runId: "run-current",
      severity: "HIGH",
      severityScore: 90,
    });

    expect(row.status).toBe("CONFIRMED");
    expect(row).not.toHaveProperty("findingStatus");
  });

  it("rejects a graph row without the API projection field", () => {
    expect(() =>
      graphRowSchema.parse({
        assetId: "asset-guide",
        assetTitle: "Installation guide",
      }),
    ).toThrow();
  });
});
