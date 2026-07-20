import type { ZodType } from "zod";

const CSRF_KEY = "ripple.csrf";

const errorEnvelopeSchema = {
  parse(value: unknown): { error: { code: string; message: string; retryable: boolean } } {
    if (
      typeof value === "object" &&
      value !== null &&
      "error" in value &&
      typeof value.error === "object" &&
      value.error !== null &&
      "code" in value.error &&
      "message" in value.error
    ) {
      return value as { error: { code: string; message: string; retryable: boolean } };
    }
    throw new Error("INVALID_ERROR_ENVELOPE");
  },
};

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export function csrfToken(): string | null {
  return typeof window === "undefined" ? null : window.sessionStorage.getItem(CSRF_KEY);
}

export function saveCsrfToken(value: string): void {
  window.sessionStorage.setItem(CSRF_KEY, value);
}

export function clearCsrfToken(): void {
  window.sessionStorage.removeItem(CSRF_KEY);
}

export function idempotencyKey(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export async function apiRequest<T>(
  path: string,
  schema: ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body !== undefined) headers.set("content-type", "application/json");
  if (init.method && !["GET", "HEAD"].includes(init.method.toUpperCase())) {
    const csrf = csrfToken();
    if (csrf) headers.set("x-ripple-csrf", csrf);
  }

  const response = await fetch(path, { ...init, credentials: "same-origin", headers });
  let decoded: unknown;
  try {
    decoded = await response.json();
  } catch {
    throw new ApiClientError("INVALID_RESPONSE", "Ripple received an invalid response.", 502, true);
  }
  if (!response.ok) {
    try {
      const failure = errorEnvelopeSchema.parse(decoded).error;
      throw new ApiClientError(failure.code, failure.message, response.status, failure.retryable);
    } catch (error) {
      if (error instanceof ApiClientError) throw error;
      throw new ApiClientError(
        "INVALID_RESPONSE",
        "Ripple received an invalid response.",
        502,
        true,
      );
    }
  }
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    !("ok" in decoded) ||
    decoded.ok !== true ||
    !("data" in decoded)
  ) {
    throw new ApiClientError("INVALID_RESPONSE", "Ripple received an invalid response.", 502, true);
  }
  const parsed = schema.safeParse(decoded.data);
  if (!parsed.success) {
    throw new ApiClientError("INVALID_RESPONSE", "Ripple received an invalid response.", 502, true);
  }
  return parsed.data;
}
