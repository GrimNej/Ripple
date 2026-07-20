import { z } from "zod";

const safeId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u);
const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{20,128}$/u);
const reason = z.string().max(500).default("");
const content = z.string().min(1).max(262_144);
const githubPath = z
  .string()
  .min(1)
  .max(240)
  .regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_./ -]+$/u);
const monitorAssetSchema = z
  .object({
    assetType: z.enum(["README", "INSTALL_GUIDE", "SUPPORT_MACRO", "TROUBLESHOOTING", "WORKFLOW"]),
    criticality: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    path: githubPath,
    title: z.string().min(1).max(160),
  })
  .strict();

export const loginSchema = z.object({ accessCode: z.string().min(1).max(256) }).strict();
export const startRunSchema = z
  .object({
    idempotencyKey,
    newSnapshotId: safeId,
    oldSnapshotId: safeId,
  })
  .strict();
export const createMonitorSchema = z
  .object({
    assets: z.array(monitorAssetSchema).min(1).max(8),
    branch: z.string().max(100).default(""),
    checkIntervalMinutes: z.union([z.literal(720), z.literal(1440)]),
    name: z.string().min(1).max(100),
    notificationEmail: z.union([z.literal(""), z.email().max(254)]).default(""),
    repositoryUrl: z.url().max(300),
    sourcePath: githubPath,
  })
  .strict();
export const setMonitorStateSchema = z
  .object({
    enabled: z.boolean(),
    expectedRowVersion: z.number().int().nonnegative(),
  })
  .strict();
export const revisePatchSchema = z
  .object({
    editedContent: content,
    expectedPatchRevision: z.number().int().positive(),
    expectedPatchRowVersion: z.number().int().nonnegative(),
    idempotencyKey,
    reason,
  })
  .strict();
export const applyPatchSchema = z
  .object({
    approvedContent: content,
    expectedAssetVersionId: safeId,
    expectedPatchRevision: z.number().int().positive(),
    expectedPatchRowVersion: z.number().int().nonnegative(),
    idempotencyKey,
    reason,
  })
  .strict();
export const rejectPatchSchema = z
  .object({
    expectedPatchRevision: z.number().int().positive(),
    expectedPatchRowVersion: z.number().int().nonnegative(),
    idempotencyKey,
    reason,
  })
  .strict();
export const verifyPatchSchema = z
  .object({
    expectedPatchRowVersion: z.number().int().nonnegative(),
    idempotencyKey,
  })
  .strict();

export function isSafeId(value: string): boolean {
  return safeId.safeParse(value).success;
}
