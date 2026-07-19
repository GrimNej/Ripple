import { Hono } from "hono";

import { callSnowflakeHealth } from "./snowflake/client";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.get("/api/preflight/health", async (context) => {
  try {
    const snowflake = await callSnowflakeHealth(context.env);
    return context.json(
      {
        architecture: "static-next-hono-snowflake",
        ok: true,
        snowflake,
      },
      200,
      { "Cache-Control": "no-store" },
    );
  } catch {
    console.error(
      JSON.stringify({
        event: "snowflake_health_failed",
        path: context.req.path,
        requestId: context.req.header("cf-ray") ?? crypto.randomUUID(),
      }),
    );
    return context.json(
      {
        error: {
          code: "SNOWFLAKE_UNAVAILABLE",
          message: "The Snowflake health check could not be completed.",
        },
        ok: false,
      },
      502,
      { "Cache-Control": "no-store" },
    );
  }
});

app.notFound((context) =>
  context.json(
    {
      error: { code: "NOT_FOUND", message: "The requested API route does not exist." },
      ok: false,
    },
    404,
  ),
);

export { app };
export default app;
