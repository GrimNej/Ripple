import { z } from "zod";

import { createSnowflakeJwt } from "./jwt";

const MAX_RESPONSE_BYTES = 1_048_576;
export const SNOWFLAKE_POLL_DELAYS_MS = [1000, 2000, 4000, 8000, 10_000] as const;
const MAX_RESULT_ROWS = 200;
const HANDLE_PATTERN = /^[0-9a-f-]{16,64}$/u;

const statementResponseSchema = z
  .object({
    code: z.string().optional(),
    data: z.array(z.array(z.string().nullable())).optional(),
    resultSetMetaData: z
      .object({
        numRows: z.number().int().nonnegative().optional(),
        partitionInfo: z.array(z.object({ rowCount: z.number().int().nonnegative() })).optional(),
        rowType: z
          .array(
            z.object({
              name: z.string(),
              nullable: z.boolean().optional(),
              type: z.string(),
            }),
          )
          .optional(),
      })
      .optional(),
    statementHandle: z.string().optional(),
  })
  .loose();

type StatementResponse = z.infer<typeof statementResponseSchema>;
type BindValue = boolean | string | number;
type ResultRow = Record<string, unknown>;

export class SnowflakeClientError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly httpStatus: 400 | 409 | 413 | 422 | 429 | 500 | 502 | 503 = 502,
    readonly jobId?: string,
  ) {
    super(code);
  }
}

function normalizeHost(host: string): string {
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, "")
    .replace(/\/$/u, "");
  if (!/^[a-z0-9.-]+\.snowflakecomputing\.com$/u.test(normalized)) {
    throw new SnowflakeClientError("SNOWFLAKE_CONFIG_INVALID", false, 500);
  }
  return normalized;
}

async function readBoundedJson(response: Response): Promise<StatementResponse> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new SnowflakeClientError("UPSTREAM_NON_JSON", false, 502);
  }
  if (response.body === null) {
    throw new SnowflakeClientError("UPSTREAM_EMPTY_RESPONSE", false, 502);
  }
  const rawReader: unknown = response.body.getReader();
  const reader = rawReader as ReadableStreamDefaultReader<Uint8Array>;
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    totalBytes += result.value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel("bounded_response_exceeded");
      throw new SnowflakeClientError("UPSTREAM_RESPONSE_TOO_LARGE", false, 502);
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
    throw new SnowflakeClientError("UPSTREAM_MALFORMED_JSON", false, 502);
  }
  const validated = statementResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new SnowflakeClientError("UPSTREAM_INVALID_ENVELOPE", false, 502);
  }
  return validated.data;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(response: Response, fallback: number): number {
  const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
  return Number.isFinite(retryAfter) ? Math.min(Math.max(retryAfter, 0) * 1000, 10_000) : fallback;
}

function camelCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/_([a-z0-9])/gu, (_match, character: string) => character.toUpperCase());
}

function parseJsonCell(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new SnowflakeClientError("UPSTREAM_INVALID_CELL", false, 502);
  }
}

function decodeCell(value: string | null, type: string): unknown {
  if (value === null) return null;
  switch (type.toLowerCase()) {
    case "array":
    case "object":
    case "variant":
      return parseJsonCell(value);
    case "boolean":
      return value.toLowerCase() === "true";
    case "fixed":
    case "real": {
      const numeric = Number(value);
      return Number.isFinite(numeric) && Number.isSafeInteger(numeric) ? numeric : value;
    }
    default:
      return value;
  }
}

function rowsFromResponse(body: StatementResponse): ResultRow[] {
  const partitions = body.resultSetMetaData?.partitionInfo ?? [];
  if (partitions.length > 1) {
    throw new SnowflakeClientError("UPSTREAM_RESULT_PARTITIONED", false, 502);
  }
  const data = body.data ?? [];
  const rowType = body.resultSetMetaData?.rowType ?? [];
  if (data.length > MAX_RESULT_ROWS || data.some((row) => row.length !== rowType.length)) {
    throw new SnowflakeClientError("UPSTREAM_RESULT_INVALID", false, 502);
  }
  return data.map((row) =>
    Object.fromEntries(
      rowType.map((column, index) => [
        camelCase(column.name),
        decodeCell(row[index] ?? null, column.type),
      ]),
    ),
  );
}

function procedureResult(body: StatementResponse): ResultRow {
  const value = body.data?.[0]?.[0];
  if (typeof value !== "string") {
    throw new SnowflakeClientError("UPSTREAM_PROCEDURE_RESULT_INVALID", false, 502);
  }
  const parsed = parseJsonCell(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new SnowflakeClientError("UPSTREAM_PROCEDURE_RESULT_INVALID", false, 502);
  }
  return parsed as ResultRow;
}

function bindings(values: readonly BindValue[]): Record<string, { type: string; value: string }> {
  return Object.fromEntries(
    values.map((value, index) => [
      String(index + 1),
      {
        type: typeof value === "number" ? "FIXED" : typeof value === "boolean" ? "BOOLEAN" : "TEXT",
        value: String(value),
      },
    ]),
  );
}

async function requestHeaders(bindingsValue: CloudflareBindings): Promise<Headers> {
  const jwt = await createSnowflakeJwt(bindingsValue);
  return new Headers({
    Accept: "application/json",
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
    "User-Agent": "ripple-edge-api/0.1.0",
    "X-Snowflake-Authorization-Token-Type": "KEYPAIR_JWT",
  });
}

async function poll(
  endpoint: string,
  handle: string,
  headers: Headers,
  initialResponse: Response,
): Promise<StatementResponse> {
  if (!HANDLE_PATTERN.test(handle)) {
    throw new SnowflakeClientError("UPSTREAM_STATEMENT_HANDLE_INVALID", false, 502);
  }
  let previousResponse = initialResponse;
  for (const fallbackDelay of SNOWFLAKE_POLL_DELAYS_MS) {
    await wait(retryDelay(previousResponse, fallbackDelay));
    let response: Response;
    try {
      response = await fetch(`${endpoint}/${encodeURIComponent(handle)}`, { headers });
    } catch {
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      previousResponse = response;
      continue;
    }
    const body = await readBoundedJson(response);
    if (response.status === 202) {
      previousResponse = response;
      continue;
    }
    if (!response.ok) {
      throw new SnowflakeClientError("SNOWFLAKE_STATEMENT_FAILED", false, 502);
    }
    return body;
  }
  throw new SnowflakeClientError("SNOWFLAKE_STATEMENT_PENDING", true, 503, handle);
}

async function execute(
  bindingsValue: CloudflareBindings,
  statement: string,
  values: readonly BindValue[],
  correlationId: string,
): Promise<StatementResponse> {
  const endpoint = `https://${normalizeHost(bindingsValue.SNOWFLAKE_HOST)}/api/v2/statements`;
  const headers = await requestHeaders(bindingsValue);
  const requestId = crypto.randomUUID();
  let response: Response;
  try {
    response = await fetch(`${endpoint}?requestId=${encodeURIComponent(requestId)}`, {
      body: JSON.stringify({
        bindings: bindings(values),
        database: "RIPPLE",
        parameters: {
          QUERY_TAG: `ripple:${correlationId}`,
          ROWS_PER_RESULTSET: MAX_RESULT_ROWS,
          TIMESTAMP_TZ_OUTPUT_FORMAT: 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM',
        },
        role: "RIPPLE_APP_ROLE",
        schema: "API",
        statement,
        timeout: 10,
        warehouse: "RIPPLE_WH",
      }),
      headers,
      method: "POST",
    });
  } catch {
    throw new SnowflakeClientError("SNOWFLAKE_SUBMISSION_OUTCOME_UNKNOWN", false, 503);
  }
  if (response.status === 429 || response.status >= 500) {
    throw new SnowflakeClientError("SNOWFLAKE_UNAVAILABLE", true, 503);
  }
  const body = await readBoundedJson(response);
  if (response.status === 202) {
    if (!body.statementHandle) {
      throw new SnowflakeClientError("UPSTREAM_STATEMENT_HANDLE_MISSING", false, 502);
    }
    return poll(endpoint, body.statementHandle, headers, response);
  }
  if (!response.ok) {
    throw new SnowflakeClientError("SNOWFLAKE_REQUEST_FAILED", false, 502);
  }
  return body;
}

async function query(
  bindingsValue: CloudflareBindings,
  statement: string,
  values: readonly BindValue[],
  correlationId: string,
): Promise<ResultRow[]> {
  return rowsFromResponse(await execute(bindingsValue, statement, values, correlationId));
}

async function call(
  bindingsValue: CloudflareBindings,
  statement: string,
  values: readonly BindValue[],
  correlationId: string,
): Promise<ResultRow> {
  return procedureResult(await execute(bindingsValue, statement, values, correlationId));
}

export async function callSnowflakeHealth(
  bindingsValue: CloudflareBindings,
  correlationId = crypto.randomUUID(),
): Promise<{ statementHandlePresent: boolean; status: "ok" }> {
  const result = await call(bindingsValue, "CALL RIPPLE.API.HEALTH()", [], correlationId);
  if (result.status !== "ok") {
    throw new SnowflakeClientError("SNOWFLAKE_HEALTH_FAILED", false, 502);
  }
  return { statementHandlePresent: true, status: "ok" };
}

export const snowflakeApi = {
  applyPatch: (
    env: CloudflareBindings,
    input: {
      approvedContent: string;
      correlationId: string;
      expectedAssetVersionId: string;
      expectedPatchRevision: number;
      expectedPatchRowVersion: number;
      idempotencyKey: string;
      patchId: string;
      reason: string;
    },
  ) =>
    call(
      env,
      "CALL RIPPLE.API.APPLY_PATCH(?, ?, ?, ?, ?, ?, ?, ?)",
      [
        input.patchId,
        input.expectedPatchRevision,
        input.expectedPatchRowVersion,
        input.expectedAssetVersionId,
        input.approvedContent,
        input.reason,
        input.idempotencyKey,
        input.correlationId,
      ],
      input.correlationId,
    ),
  dashboard: (env: CloudflareBindings, correlationId: string) =>
    query(env, "SELECT * FROM RIPPLE.API.DASHBOARD_V", [], correlationId),
  dueMonitors: (env: CloudflareBindings, correlationId: string) =>
    query(
      env,
      "SELECT * FROM RIPPLE.API.MONITOR_DUE_V ORDER BY created_at LIMIT 10",
      [],
      correlationId,
    ),
  findings: (env: CloudflareBindings, runId: string, correlationId: string) =>
    query(
      env,
      "SELECT * FROM RIPPLE.API.RUN_FINDING_V WHERE run_id = ? ORDER BY severity_score DESC, finding_id",
      [runId],
      correlationId,
    ),
  graph: (env: CloudflareBindings, runId: string, correlationId: string) =>
    query(
      env,
      "SELECT * FROM RIPPLE.API.RUN_GRAPH_V WHERE run_id = ? ORDER BY severity_score DESC, finding_id",
      [runId],
      correlationId,
    ),
  ingestMonitor: (
    env: CloudflareBindings,
    input: {
      correlationId: string;
      idempotencyKey: string;
      payloadJson: string;
      triggerType: "CONNECT" | "MANUAL" | "SCHEDULED";
    },
  ) =>
    call(
      env,
      "CALL RIPPLE.API.INGEST_MONITOR(?, ?, ?, ?)",
      [input.payloadJson, input.triggerType, input.idempotencyKey, input.correlationId],
      input.correlationId,
    ),
  markMonitorNotification: (
    env: CloudflareBindings,
    checkId: string,
    status: "FAILED" | "SENT",
    correlationId: string,
  ) =>
    call(env, "CALL RIPPLE.API.MARK_MONITOR_NOTIFICATION(?, ?)", [checkId, status], correlationId),
  monitorNotifications: (env: CloudflareBindings, correlationId: string) =>
    query(
      env,
      "SELECT * FROM RIPPLE.API.MONITOR_NOTIFICATION_V ORDER BY checked_at LIMIT 10",
      [],
      correlationId,
    ),
  monitors: (env: CloudflareBindings, correlationId: string) =>
    query(env, "SELECT * FROM RIPPLE.API.MONITOR_V ORDER BY created_at", [], correlationId),
  monitor: (env: CloudflareBindings, monitorId: string, correlationId: string) =>
    query(
      env,
      "SELECT * FROM RIPPLE.API.MONITOR_V WHERE monitor_id = ?",
      [monitorId],
      correlationId,
    ),
  patch: (env: CloudflareBindings, patchId: string, correlationId: string) =>
    query(
      env,
      "SELECT * FROM RIPPLE.API.PATCH_DETAIL_V WHERE patch_id = ?",
      [patchId],
      correlationId,
    ),
  patches: (env: CloudflareBindings, runId: string, correlationId: string) =>
    query(
      env,
      "SELECT * FROM RIPPLE.API.RUN_PATCH_V WHERE run_id = ? ORDER BY created_at, patch_id",
      [runId],
      correlationId,
    ),
  proof: (env: CloudflareBindings, correlationId: string) =>
    query(env, "SELECT * FROM RIPPLE.API.PROOF_V", [], correlationId),
  rejectPatch: (
    env: CloudflareBindings,
    input: {
      correlationId: string;
      expectedPatchRevision: number;
      expectedPatchRowVersion: number;
      idempotencyKey: string;
      patchId: string;
      reason: string;
    },
  ) =>
    call(
      env,
      "CALL RIPPLE.API.REJECT_PATCH(?, ?, ?, ?, ?, ?)",
      [
        input.patchId,
        input.expectedPatchRevision,
        input.expectedPatchRowVersion,
        input.reason,
        input.idempotencyKey,
        input.correlationId,
      ],
      input.correlationId,
    ),
  revisePatch: (
    env: CloudflareBindings,
    input: {
      correlationId: string;
      editedContent: string;
      expectedPatchRevision: number;
      expectedPatchRowVersion: number;
      idempotencyKey: string;
      patchId: string;
      reason: string;
    },
  ) =>
    call(
      env,
      "CALL RIPPLE.API.REVISE_PATCH(?, ?, ?, ?, ?, ?, ?)",
      [
        input.patchId,
        input.expectedPatchRevision,
        input.expectedPatchRowVersion,
        input.editedContent,
        input.reason,
        input.idempotencyKey,
        input.correlationId,
      ],
      input.correlationId,
    ),
  run: (env: CloudflareBindings, runId: string, correlationId: string) =>
    query(env, "SELECT * FROM RIPPLE.API.RUN_SUMMARY_V WHERE run_id = ?", [runId], correlationId),
  runProvenance: (env: CloudflareBindings, runId: string, correlationId: string) =>
    query(
      env,
      "SELECT * FROM RIPPLE.API.RUN_PROVENANCE_V WHERE run_id = ?",
      [runId],
      correlationId,
    ),
  setMonitorEnabled: (
    env: CloudflareBindings,
    monitorId: string,
    enabled: boolean,
    expectedRowVersion: number,
    correlationId: string,
  ) =>
    call(
      env,
      "CALL RIPPLE.API.SET_MONITOR_ENABLED(?, ?, ?)",
      [monitorId, enabled, expectedRowVersion],
      correlationId,
    ),
  stages: (env: CloudflareBindings, runId: string, correlationId: string) =>
    query(
      env,
      "SELECT * FROM RIPPLE.API.RUN_STAGE_V WHERE run_id = ? ORDER BY started_at, stage_name",
      [runId],
      correlationId,
    ),
  startAnalysis: (
    env: CloudflareBindings,
    input: {
      correlationId: string;
      idempotencyKey: string;
      newSnapshotId: string;
      oldSnapshotId: string;
    },
  ) =>
    call(
      env,
      "CALL RIPPLE.API.START_ANALYSIS(?, ?, ?, ?)",
      [input.oldSnapshotId, input.newSnapshotId, input.idempotencyKey, input.correlationId],
      input.correlationId,
    ),
  verifyPatch: (
    env: CloudflareBindings,
    input: {
      correlationId: string;
      expectedPatchRowVersion: number;
      idempotencyKey: string;
      patchId: string;
    },
  ) =>
    call(
      env,
      "CALL RIPPLE.API.VERIFY_PATCH(?, ?, ?, ?)",
      [input.patchId, input.expectedPatchRowVersion, input.idempotencyKey, input.correlationId],
      input.correlationId,
    ),
} as const;
