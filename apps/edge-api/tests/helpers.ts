import { generateKeyPairSync } from "node:crypto";

import { deriveAccessCodeDigest, createSession, SESSION_COOKIE } from "../src/security/session";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" });

export const TEST_ACCESS_CODE = "ripple-test-access-code";

export async function testBindings(): Promise<CloudflareBindings> {
  const base = {
    ACCESS_CODE_HMAC: "",
    APP_ORIGIN: "https://ripple.test",
    ASSETS: {
      fetch: () => Promise.resolve(new Response("static asset")),
    } as unknown as Fetcher,
    LOGIN_PEPPER: "test-login-pepper-is-at-least-thirty-two-characters",
    SESSION_SIGNING_SECRET: "test-session-secret-is-at-least-thirty-two-characters",
    SNOWFLAKE_ACCOUNT_LOCATOR: "xy12345",
    SNOWFLAKE_HOST: "xy12345.example.snowflakecomputing.com",
    SNOWFLAKE_PRIVATE_KEY: privateKeyPem,
    SNOWFLAKE_PUBLIC_KEY_FINGERPRINT: "test-fingerprint",
    SNOWFLAKE_USER: "RIPPLE_APP_USER",
  } satisfies CloudflareBindings;
  return {
    ...base,
    ACCESS_CODE_HMAC: await deriveAccessCodeDigest(base, TEST_ACCESS_CODE),
  };
}

export async function authenticatedHeaders(
  env: CloudflareBindings,
  includeMutationHeaders = false,
): Promise<{ headers: Headers; csrfToken: string }> {
  const session = await createSession(env);
  const headers = new Headers({ cookie: `${SESSION_COOKIE}=${session.token}` });
  if (includeMutationHeaders) {
    headers.set("content-type", "application/json");
    headers.set("origin", env.APP_ORIGIN);
    headers.set("x-ripple-csrf", session.csrfToken);
  }
  return { csrfToken: session.csrfToken, headers };
}

export function procedureResponse(value: Record<string, unknown>, status = 200): Response {
  return new Response(
    JSON.stringify({
      data: [[JSON.stringify(value)]],
      statementHandle: "12345678-abcd-abcd-abcd-1234567890ab",
    }),
    { headers: { "content-type": "application/json" }, status },
  );
}

export function queryResponse(
  rows: string[][],
  columns: { name: string; type: string }[],
  status = 200,
): Response {
  return new Response(
    JSON.stringify({
      data: rows,
      resultSetMetaData: {
        numRows: rows.length,
        partitionInfo: [{ rowCount: rows.length }],
        rowType: columns,
      },
      statementHandle: "12345678-abcd-abcd-abcd-1234567890ab",
    }),
    { headers: { "content-type": "application/json" }, status },
  );
}
