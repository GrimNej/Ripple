import { z } from "zod";

const safeId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u);
const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{20,128}$/u);
const reason = z.string().max(500).default("");
const content = z.string().min(1).max(262_144);

export const loginSchema = z.object({ accessCode: z.string().min(1).max(256) }).strict();
export const startRunSchema = z
  .object({
    idempotencyKey,
    newSnapshotId: safeId,
    oldSnapshotId: safeId,
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
