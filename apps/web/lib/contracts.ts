import { z } from "zod";

const count = z
  .union([z.number().int().nonnegative(), z.string()])
  .transform((value) => (typeof value === "number" ? value : Number.parseInt(value, 10)));
const nullableText = z.string().nullable();

export const sessionSchema = z.object({
  authenticated: z.literal(true),
  expiresAt: z.string(),
});

export const sessionStatusSchema = z.discriminatedUnion("authenticated", [
  sessionSchema,
  z.object({ authenticated: z.literal(false) }),
]);

export const loginSchema = z.object({
  authenticated: z.literal(true),
  csrfToken: z.string().min(1),
  expiresAt: z.string(),
});

export const dashboardSchema = z
  .object({
    assetCount: count,
    changeCount: count,
    completedAt: nullableText,
    confirmedCount: count,
    createdAt: z.string(),
    currentStage: z.string(),
    patchCount: count,
    rejectedCount: count,
    reviewRequiredCount: count,
    runId: z.string(),
    sourceCount: count,
    status: z.string(),
    uncertainCount: count,
    verifiedPatchCount: count,
  })
  .nullable();

export const runSummarySchema = z.object({
  changeCount: count,
  completedAt: nullableText,
  confirmedCount: count,
  createdAt: z.string(),
  currentStage: z.string(),
  failureCode: nullableText,
  failureStage: nullableText,
  patchCount: count,
  rejectedCount: count,
  rowVersion: count,
  runId: z.string(),
  status: z.string(),
  uncertainCount: count,
});

export const stageSchema = z.object({
  attemptCount: count.nullable(),
  completedAt: nullableText,
  stageFailureCode: nullableText,
  stageName: z.string().nullable(),
  stageStatus: z.string().nullable(),
  startedAt: nullableText,
});

export const runDetailSchema = z.object({
  run: runSummarySchema,
  stages: z.array(stageSchema),
});

export const findingSchema = z.object({
  assetExcerpt: nullableText.optional(),
  assetId: z.string(),
  assetTitle: z.string(),
  assetType: z.string(),
  assetVersionId: z.string().optional(),
  changeAtomId: z.string(),
  changeType: z.string(),
  criticality: z.string(),
  findingId: z.string(),
  impactType: z.string(),
  newClaim: z.string(),
  oldClaim: z.string(),
  runId: z.string(),
  severity: z.string(),
  severityScore: count,
  sourceExcerpt: nullableText.optional(),
  status: z.string(),
});

export const graphRowSchema = findingSchema
  .omit({ status: true })
  .pick({
    assetId: true,
    assetTitle: true,
    assetType: true,
    changeAtomId: true,
    changeType: true,
    criticality: true,
    findingId: true,
    impactType: true,
    newClaim: true,
    oldClaim: true,
    runId: true,
    severity: true,
    severityScore: true,
  })
  .extend({ findingStatus: z.string() })
  .transform(({ findingStatus, ...row }) => ({ ...row, status: findingStatus }));

export const runPatchSchema = z.object({
  appliedAssetVersionId: nullableText,
  assetId: z.string(),
  assetTitle: z.string(),
  assetType: z.string(),
  changeAtomId: z.string(),
  changeType: z.string(),
  createdAt: z.string(),
  criticality: z.string(),
  findingId: z.string(),
  newClaim: z.string(),
  oldClaim: z.string(),
  patchId: z.string(),
  revision: count,
  rowVersion: count,
  runId: z.string(),
  severity: z.string(),
  status: z.string(),
  targetAssetVersionId: z.string(),
  updatedAt: z.string(),
});

export const patchDetailSchema = z.object({
  aiAdvisory: z.unknown().nullable().optional(),
  appliedAssetVersionId: nullableText,
  assetId: z.string(),
  assetTitle: z.string(),
  assetType: z.string(),
  changeType: z.string(),
  criticality: z.string(),
  currentContent: z.string(),
  currentContentSha256: z.string(),
  currentVersionId: z.string(),
  newClaim: z.string(),
  oldClaim: z.string(),
  originalContent: z.string(),
  originalContentSha256: z.string(),
  patchId: z.string(),
  proposedContent: z.string(),
  revision: count,
  rowVersion: count,
  runId: z.string(),
  severity: z.string(),
  status: z.string(),
  targetAssetVersionId: z.string(),
  verificationChecks: z.unknown().nullable().optional(),
  verificationId: nullableText.optional(),
  verificationStatus: nullableText.optional(),
  verifiedAt: nullableText.optional(),
});

export const proofSchema = z
  .object({
    admittedAiCallCount: count,
    appliedMigrationCount: count,
    auditEventCount: count,
    auditHeadValid: count,
    frozenLabelCount: count,
    successfulAiRunCount: count,
    taskProofCount: count,
    verifiedPatchCount: count,
  })
  .nullable();

export const mutationResultSchema = z
  .object({
    assetVersionId: z.string().optional(),
    code: z.string().optional(),
    patchId: z.string().optional(),
    rowVersion: count.optional(),
    runId: z.string().optional(),
    status: z.string().optional(),
  })
  .loose();

export const logoutSchema = z.object({ authenticated: z.literal(false) });

export type Dashboard = z.infer<typeof dashboardSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type GraphRow = z.infer<typeof graphRowSchema>;
export type PatchDetail = z.infer<typeof patchDetailSchema>;
export type Proof = z.infer<typeof proofSchema>;
export type RunDetail = z.infer<typeof runDetailSchema>;
export type RunPatch = z.infer<typeof runPatchSchema>;
