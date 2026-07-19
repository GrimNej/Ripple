import { createSnowflakeJwt } from "./jwt";

const MAX_RESPONSE_BYTES = 1_048_576;
const POLL_DELAYS_MS = [1000, 2000, 4000] as const;
const HEALTH_STATEMENT = "CALL RIPPLE.API.HEALTH()";

type SnowflakeResponse = {
  code?: string;
  data?: unknown[][];
  statementHandle?: string;
};

export type SnowflakeHealthResult = {
  statementHandlePresent: boolean;
  status: "ok";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownMatrix(value: unknown): value is unknown[][] {
  return Array.isArray(value) && value.every((row) => Array.isArray(row));
}

async function readBoundedJson(response: Response): Promise<SnowflakeResponse> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("Snowflake returned a non-JSON response.");
  }
  if (response.body === null) throw new Error("Snowflake returned an empty response.");
  const rawReader: unknown = response.body.getReader();
  const reader = rawReader as ReadableStreamDefaultReader<Uint8Array>;
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    totalBytes += result.value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel("Response exceeded the Ripple SQL API limit.");
      throw new Error("Snowflake response exceeded the 1 MiB limit.");
    }
    chunks.push(result.value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("Snowflake returned malformed JSON.");
  }
  if (!isRecord(parsed)) throw new Error("Snowflake returned an invalid result envelope.");

  return {
    ...(typeof parsed.code === "string" ? { code: parsed.code } : {}),
    ...(isUnknownMatrix(parsed.data) ? { data: parsed.data } : {}),
    ...(typeof parsed.statementHandle === "string"
      ? { statementHandle: parsed.statementHandle }
      : {}),
  };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeHost(host: string): string {
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, "")
    .replace(/\/$/u, "");
  if (!/^[a-z0-9.-]+\.snowflakecomputing\.com$/u.test(normalized)) {
    throw new Error("Snowflake host is invalid.");
  }
  return normalized;
}

export async function callSnowflakeHealth(
  bindings: CloudflareBindings,
): Promise<SnowflakeHealthResult> {
  const jwt = await createSnowflakeJwt(bindings);
  const endpoint = `https://${normalizeHost(bindings.SNOWFLAKE_HOST)}/api/v2/statements`;
  const headers = new Headers({
    Accept: "application/json",
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
    "User-Agent": "ripple-edge-api/0.0.0",
    "X-Snowflake-Authorization-Token-Type": "KEYPAIR_JWT",
  });
  let response = await fetch(endpoint, {
    body: JSON.stringify({
      database: "RIPPLE",
      role: "RIPPLE_APP_ROLE",
      schema: "API",
      statement: HEALTH_STATEMENT,
      timeout: 10,
      warehouse: "RIPPLE_WH",
    }),
    headers,
    method: "POST",
  });
  let body = await readBoundedJson(response);

  if (response.status === 202) {
    const handle = body.statementHandle;
    if (!handle) throw new Error("Snowflake returned no statement handle.");

    for (const delay of POLL_DELAYS_MS) {
      const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
      await wait(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 10_000) : delay);
      response = await fetch(`${endpoint}/${encodeURIComponent(handle)}`, { headers });
      body = await readBoundedJson(response);
      if (response.status !== 202) break;
    }
  }

  if (!response.ok) {
    const upstreamCode = body.code ?? "UNKNOWN";
    throw new Error(`Snowflake SQL API request failed with code ${upstreamCode}.`);
  }
  const rawResult = body.data?.[0]?.[0];
  if (typeof rawResult !== "string") {
    throw new Error("Snowflake health procedure returned an invalid result.");
  }

  let health: unknown;
  try {
    health = JSON.parse(rawResult);
  } catch {
    throw new Error("Snowflake health procedure returned malformed JSON.");
  }
  if (!isRecord(health) || health.status !== "ok") {
    throw new Error("Snowflake health procedure did not report success.");
  }
  return {
    statementHandlePresent: Boolean(body.statementHandle),
    status: "ok",
  };
}
