import { deleteCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";

import {
  applyPatchSchema,
  isSafeId,
  loginSchema,
  rejectPatchSchema,
  revisePatchSchema,
  startRunSchema,
  verifyPatchSchema,
} from "./contracts";
import { ApiError, correlationId, domainError, parseBody, requireOrigin } from "./http";
import {
  createSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  type SessionPayload,
  verifyAccessCode,
  verifyCsrf,
  verifySession,
} from "./security/session";
import { callSnowflakeHealth, SnowflakeClientError, snowflakeApi } from "./snowflake/client";

type RippleEnv = {
  Bindings: CloudflareBindings;
  Variables: {
    correlationId: string;
    session: SessionPayload;
    startedAt: number;
  };
};

const app = new Hono<RippleEnv>();

function success(data: unknown, correlation: string): Record<string, unknown> {
  return { correlationId: correlation, data, ok: true };
}

function requireSafePathId(value: string, code: string): void {
  if (!isSafeId(value)) throw new ApiError(code, "The requested resource was not found.", 404);
}

function requireRows<T>(rows: T[], code: string, message: string): T[] {
  if (rows.length === 0) throw new ApiError(code, message, 404);
  return rows;
}

function securityHeaders(headers: Headers): void {
  headers.set("Cache-Control", "no-store");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const [cookieName, ...valueParts] = part.trim().split("=");
    if (cookieName === name) return valueParts.join("=");
  }
  return undefined;
}

function logRoute(path: string): string {
  const fixedRoutes = new Set([
    "/api/auth/login",
    "/api/auth/logout",
    "/api/dashboard",
    "/api/preflight/health",
    "/api/proof",
    "/api/runs",
    "/api/session",
  ]);
  if (fixedRoutes.has(path)) return path;
  const dynamicRoutes: [RegExp, string][] = [
    [/^\/api\/runs\/[^/]+\/graph$/u, "/api/runs/:runId/graph"],
    [/^\/api\/runs\/[^/]+\/findings$/u, "/api/runs/:runId/findings"],
    [/^\/api\/runs\/[^/]+$/u, "/api/runs/:runId"],
    [/^\/api\/patches\/[^/]+\/(?:revise|apply|reject|verify)$/u, "/api/patches/:patchId/:action"],
    [/^\/api\/patches\/[^/]+$/u, "/api/patches/:patchId"],
  ];
  return dynamicRoutes.find(([pattern]) => pattern.test(path))?.[1] ?? "unmatched_api_route";
}

app.use("*", async (context, next) => {
  context.set("correlationId", correlationId(context.req.header("x-correlation-id")));
  context.set("startedAt", performance.now());
  await next();
  securityHeaders(context.res.headers);
  if (context.req.path.startsWith("/api/")) {
    console.info(
      JSON.stringify({
        correlationId: context.get("correlationId"),
        durationMs: Number((performance.now() - context.get("startedAt")).toFixed(2)),
        event: "api_request",
        method: context.req.method,
        path: logRoute(context.req.path),
        status: context.res.status,
      }),
    );
  }
});

app.use("/api/*", async (context, next) => {
  if (context.req.path === "/api/auth/login") {
    await next();
    return;
  }
  const token = cookieValue(context.req.header("cookie"), SESSION_COOKIE);
  const session = token ? await verifySession(context.env, token) : null;
  if (!session) throw new ApiError("SESSION_REQUIRED", "Sign in to continue.", 401);
  context.set("session", session);
  if (!["GET", "HEAD"].includes(context.req.method)) {
    requireOrigin(context.req.header("origin"), context.env.APP_ORIGIN);
    const csrfToken = context.req.header("x-ripple-csrf") ?? "";
    if (!(await verifyCsrf(session, csrfToken))) {
      throw new ApiError("CSRF_REJECTED", "The request could not be verified.", 403);
    }
  }
  await next();
});

app.post("/api/auth/login", async (context) => {
  requireOrigin(context.req.header("origin"), context.env.APP_ORIGIN);
  let accessCode = "";
  try {
    accessCode = (await parseBody(context, loginSchema)).accessCode;
  } catch {
    await verifyAccessCode(context.env, "invalid-login-shape");
    throw new ApiError("AUTHENTICATION_FAILED", "The access code is invalid.", 401);
  }
  if (!(await verifyAccessCode(context.env, accessCode))) {
    throw new ApiError("AUTHENTICATION_FAILED", "The access code is invalid.", 401);
  }
  const session = await createSession(context.env);
  setCookie(context, SESSION_COOKIE, session.token, {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "Strict",
    secure: true,
  });
  return context.json(
    success(
      { authenticated: true, csrfToken: session.csrfToken, expiresAt: session.expiresAt },
      context.get("correlationId"),
    ),
  );
});

app.post("/api/auth/logout", (context) => {
  deleteCookie(context, SESSION_COOKIE, { path: "/", secure: true });
  return context.json(success({ authenticated: false }, context.get("correlationId")));
});

app.get("/api/session", (context) =>
  context.json(
    success(
      {
        authenticated: true,
        expiresAt: new Date(context.get("session").exp * 1000).toISOString(),
      },
      context.get("correlationId"),
    ),
  ),
);

app.get("/api/preflight/health", async (context) => {
  const snowflake = await callSnowflakeHealth(context.env, context.get("correlationId"));
  return context.json(
    success(
      { architecture: "static-next-hono-snowflake", snowflake },
      context.get("correlationId"),
    ),
  );
});

app.get("/api/dashboard", async (context) => {
  const rows = await snowflakeApi.dashboard(context.env, context.get("correlationId"));
  return context.json(success(rows[0] ?? null, context.get("correlationId")));
});

app.post("/api/runs", async (context) => {
  const body = await parseBody(context, startRunSchema);
  const result = await snowflakeApi.startAnalysis(context.env, {
    ...body,
    correlationId: context.get("correlationId"),
  });
  const failure = domainError(result);
  if (failure) throw failure;
  return context.json(success(result, context.get("correlationId")), 202);
});

app.get("/api/runs/:runId", async (context) => {
  const runId = context.req.param("runId");
  requireSafePathId(runId, "RUN_NOT_FOUND");
  const correlation = context.get("correlationId");
  const [runRows, stages] = await Promise.all([
    snowflakeApi.run(context.env, runId, correlation),
    snowflakeApi.stages(context.env, runId, correlation),
  ]);
  const run = requireRows(runRows, "RUN_NOT_FOUND", "The requested run was not found.")[0];
  return context.json(success({ run, stages }, correlation));
});

app.get("/api/runs/:runId/graph", async (context) => {
  const runId = context.req.param("runId");
  requireSafePathId(runId, "RUN_NOT_FOUND");
  const rows = await snowflakeApi.graph(context.env, runId, context.get("correlationId"));
  return context.json(success(rows, context.get("correlationId")));
});

app.get("/api/runs/:runId/findings", async (context) => {
  const runId = context.req.param("runId");
  requireSafePathId(runId, "RUN_NOT_FOUND");
  const rows = await snowflakeApi.findings(context.env, runId, context.get("correlationId"));
  return context.json(success(rows, context.get("correlationId")));
});

app.get("/api/patches/:patchId", async (context) => {
  const patchId = context.req.param("patchId");
  requireSafePathId(patchId, "PATCH_NOT_FOUND");
  const rows = await snowflakeApi.patch(context.env, patchId, context.get("correlationId"));
  const patch = requireRows(rows, "PATCH_NOT_FOUND", "The requested patch was not found.")[0];
  return context.json(success(patch, context.get("correlationId")));
});

app.post("/api/patches/:patchId/revise", async (context) => {
  const patchId = context.req.param("patchId");
  requireSafePathId(patchId, "PATCH_NOT_FOUND");
  const body = await parseBody(context, revisePatchSchema);
  const result = await snowflakeApi.revisePatch(context.env, {
    ...body,
    correlationId: context.get("correlationId"),
    patchId,
  });
  const failure = domainError(result);
  if (failure) throw failure;
  return context.json(success(result, context.get("correlationId")));
});

app.post("/api/patches/:patchId/apply", async (context) => {
  const patchId = context.req.param("patchId");
  requireSafePathId(patchId, "PATCH_NOT_FOUND");
  const body = await parseBody(context, applyPatchSchema);
  const result = await snowflakeApi.applyPatch(context.env, {
    ...body,
    correlationId: context.get("correlationId"),
    patchId,
  });
  const failure = domainError(result);
  if (failure) throw failure;
  return context.json(success(result, context.get("correlationId")));
});

app.post("/api/patches/:patchId/reject", async (context) => {
  const patchId = context.req.param("patchId");
  requireSafePathId(patchId, "PATCH_NOT_FOUND");
  const body = await parseBody(context, rejectPatchSchema);
  const result = await snowflakeApi.rejectPatch(context.env, {
    ...body,
    correlationId: context.get("correlationId"),
    patchId,
  });
  const failure = domainError(result);
  if (failure) throw failure;
  return context.json(success(result, context.get("correlationId")));
});

app.post("/api/patches/:patchId/verify", async (context) => {
  const patchId = context.req.param("patchId");
  requireSafePathId(patchId, "PATCH_NOT_FOUND");
  const body = await parseBody(context, verifyPatchSchema);
  const result = await snowflakeApi.verifyPatch(context.env, {
    ...body,
    correlationId: context.get("correlationId"),
    patchId,
  });
  const failure = domainError(result);
  if (failure) throw failure;
  return context.json(success(result, context.get("correlationId")));
});

app.get("/api/proof", async (context) => {
  const rows = await snowflakeApi.proof(context.env, context.get("correlationId"));
  return context.json(success(rows[0] ?? null, context.get("correlationId")));
});

app.onError((error, context) => {
  const correlation = context.get("correlationId") || crypto.randomUUID();
  let apiError: ApiError;
  if (error instanceof ApiError) {
    apiError = error;
  } else if (error instanceof SnowflakeClientError) {
    apiError = new ApiError(
      error.code,
      error.retryable
        ? "Snowflake is still processing or temporarily unavailable."
        : "Snowflake could not complete the request.",
      error.httpStatus,
      error.retryable,
      error.jobId ? { jobId: error.jobId } : undefined,
    );
  } else {
    apiError = new ApiError("INTERNAL_ERROR", "The request could not be completed.", 500);
  }
  console.error(
    JSON.stringify({
      code: apiError.code,
      correlationId: correlation,
      event: "api_error",
      method: context.req.method,
      path: logRoute(context.req.path),
      retryable: apiError.retryable,
    }),
  );
  return context.json(
    {
      correlationId: correlation,
      error: {
        code: apiError.code,
        ...(apiError.data ? { data: apiError.data } : {}),
        message: apiError.message,
        retryable: apiError.retryable,
      },
      ok: false,
    },
    apiError.status,
  );
});

app.notFound((context) => {
  if (context.req.path.startsWith("/api/")) {
    return context.json(
      {
        correlationId: context.get("correlationId"),
        error: {
          code: "NOT_FOUND",
          message: "The requested API route does not exist.",
          retryable: false,
        },
        ok: false,
      },
      404,
    );
  }
  return context.env.ASSETS.fetch(context.req.raw);
});

export { app };
export default app;
