import { describe, expect, it } from "vitest";

import { findingSchema, graphRowSchema } from "../lib/contracts";

describe("graph response contract", () => {
  it("accepts fractional severity scores returned by completed analysis runs", () => {
    const finding = findingSchema.parse({
      assetId: "asset-workflow",
      assetTitle: "Nightly workflow",
      assetType: "WORKFLOW",
      changeAtomId: "atom-endpoint",
      changeType: "ENDPOINT_REPLACEMENT",
      criticality: "HIGH",
      findingId: "finding-workflow",
      impactType: "OUTDATED_INSTRUCTION",
      newClaim: "POST /v2/jobs",
      oldClaim: "POST /v1/jobs",
      runId: "run-current",
      severity: "CRITICAL",
      severityScore: "2.9249999999999998",
      status: "CONFIRMED",
    });

    expect(finding.severityScore).toBeCloseTo(2.925);
  });

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
