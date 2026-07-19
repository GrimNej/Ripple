import type { Context, Env } from "hono";
import type { ZodType } from "zod";

const MAX_REQUEST_BYTES = 300_000;
const CORRELATION_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 502 | 503,
    readonly retryable = false,
    readonly data?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export function correlationId(suppliedValue: string | undefined): string {
  const supplied = suppliedValue?.trim();
  return supplied && CORRELATION_PATTERN.test(supplied) ? supplied : crypto.randomUUID();
}

export function requireOrigin(actualValue: string | undefined, expectedValue: string): void {
  if (!expectedValue || actualValue !== expectedValue) {
    throw new ApiError("ORIGIN_REJECTED", "This request did not come from the Ripple app.", 403);
  }
}

export async function parseBody<E extends Env, T>(
  context: Context<E>,
  schema: ZodType<T>,
): Promise<T> {
  const contentType = context.req.header("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new ApiError("INVALID_REQUEST", "The request is invalid.", 400);
  }
  const declaredLength = Number.parseInt(context.req.header("content-length") ?? "", 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new ApiError("REQUEST_TOO_LARGE", "The request is too large.", 413);
  }
  const body = context.req.raw.body;
  if (body === null) throw new ApiError("INVALID_REQUEST", "The request is invalid.", 400);
  const rawReader: unknown = body.getReader();
  const reader = rawReader as ReadableStreamDefaultReader<Uint8Array>;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel("bounded_request_exceeded");
      throw new ApiError("REQUEST_TOO_LARGE", "The request is too large.", 413);
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError("INVALID_REQUEST", "The request is invalid.", 400);
  }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new ApiError("INVALID_REQUEST", "The request is invalid.", 400);
  return result.data;
}

export const domainMessages: Record<string, string> = {
  IDEMPOTENCY_CONFLICT: "This retry does not match the original request.",
  INVALID_APPROVED_CONTENT: "The reviewed content is invalid.",
  PATCH_ALREADY_DECIDED: "This patch has already been decided.",
  PATCH_ALREADY_VERIFIED: "This patch has already been verified.",
  PATCH_NOT_APPLIED: "Apply the patch before verifying it.",
  PATCH_NOT_FOUND: "The requested patch was not found.",
  RUN_NOT_FOUND: "The requested run was not found.",
  SNAPSHOT_PAIR_NOT_FINALIZED: "Both prepared source versions must be finalized.",
  STALE_ASSET_VERSION: "The asset changed after this patch was generated.",
  STALE_PATCH_REVISION: "The patch changed after this view was loaded.",
};

export function domainError(result: Record<string, unknown>): ApiError | null {
  if (result.ok !== false) return null;
  const code = typeof result.code === "string" ? result.code : "MUTATION_FAILED";
  const conflictCodes = new Set([
    "IDEMPOTENCY_CONFLICT",
    "PATCH_ALREADY_DECIDED",
    "PATCH_ALREADY_VERIFIED",
    "STALE_ASSET_VERSION",
    "STALE_PATCH_REVISION",
  ]);
  return new ApiError(
    code,
    domainMessages[code] ?? "The operation could not be completed.",
    conflictCodes.has(code) ? 409 : code.endsWith("NOT_FOUND") ? 404 : 422,
  );
}
