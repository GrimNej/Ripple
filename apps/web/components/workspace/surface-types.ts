import type { UseQueryResult } from "@tanstack/react-query";

import type { Dashboard, Finding, RunDetail, RunPatch, RunProvenance } from "../../lib/contracts";

export type SurfaceProperties = Readonly<{
  dashboard: UseQueryResult<Dashboard>;
  findings: UseQueryResult<Finding[]>;
  patches: UseQueryResult<RunPatch[]>;
  provenance: UseQueryResult<RunProvenance>;
  run: UseQueryResult<RunDetail>;
  runId: string | undefined;
}>;

export function surfaceError(properties: SurfaceProperties): Error | null {
  const error = [
    properties.dashboard.error,
    properties.run.error,
    properties.findings.error,
    properties.patches.error,
    properties.provenance.error,
  ].find((candidate): candidate is Error => candidate instanceof Error);
  return error ?? null;
}
