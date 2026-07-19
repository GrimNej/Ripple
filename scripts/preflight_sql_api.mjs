import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readFile } from "node:fs/promises";

const MAX_RESPONSE_BYTES = 1_048_576;
const POLL_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 10_000];

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function encodeBase64Url(value) {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return Buffer.from(bytes).toString("base64url");
}

async function createSnowflakeJwt({ accountLocator, privateKeyPath, user }) {
  const privateKeyPem = await readFile(privateKeyPath, "utf8");
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKeyDer = createPublicKey(privateKey).export({
    format: "der",
    type: "spki",
  });
  const fingerprint = createHash("sha256").update(publicKeyDer).digest("base64");
  const qualifiedUser = `${accountLocator.toUpperCase()}.${user.toUpperCase()}`;
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      iss: `${qualifiedUser}.SHA256:${fingerprint}`,
      sub: qualifiedUser,
      iat: nowSeconds - 60,
      exp: nowSeconds + 3_540,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), privateKey);
  return `${signingInput}.${encodeBase64Url(signature)}`;
}

async function parseJsonResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`Snowflake returned a non-JSON response (${response.status}).`);
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("Snowflake response exceeded the 1 MiB preflight limit.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Snowflake returned malformed JSON (${response.status}).`);
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

async function submitHealthCall({ host, jwt }) {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
    "User-Agent": "ripple-preflight/0.0.0",
    "X-Snowflake-Authorization-Token-Type": "KEYPAIR_JWT",
  };
  const endpoint = `https://${host}/api/v2/statements`;
  let response = await globalThis.fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      statement: "CALL RIPPLE.API.HEALTH()",
      timeout: 10,
      database: "RIPPLE",
      schema: "API",
      warehouse: "RIPPLE_WH",
      role: "RIPPLE_APP_ROLE",
    }),
  });
  let body = await parseJsonResponse(response);

  if (response.status === 202) {
    const handle = body.statementHandle;
    if (typeof handle !== "string" || !handle) {
      throw new Error("Snowflake returned 202 without a statement handle.");
    }
    for (const delay of POLL_DELAYS_MS) {
      await sleep(delay);
      response = await globalThis.fetch(`${endpoint}/${encodeURIComponent(handle)}`, { headers });
      body = await parseJsonResponse(response);
      if (response.status !== 202) break;
    }
  }

  if (!response.ok) {
    const code = typeof body.code === "string" ? body.code : "UNKNOWN_UPSTREAM_ERROR";
    throw new Error(`Snowflake SQL API failed (${response.status}, ${code}).`);
  }
  if (!Array.isArray(body.data) || body.data.length !== 1) {
    throw new Error("Snowflake health procedure returned an unexpected result shape.");
  }
  const result = body.data[0]?.[0];
  if (typeof result !== "string" || !result.includes('"status": "ok"')) {
    throw new Error("Snowflake health procedure did not return the expected status.");
  }
  return {
    httpStatus: response.status,
    rows: body.data.length,
    statementHandlePresent: typeof body.statementHandle === "string",
  };
}

const accountLocator = requireEnvironment("RIPPLE_SNOWFLAKE_ACCOUNT_LOCATOR");
const host = requireEnvironment("RIPPLE_SNOWFLAKE_HOST");
const privateKeyPath = requireEnvironment("RIPPLE_SNOWFLAKE_PRIVATE_KEY_PATH");
const user = "RIPPLE_APP_USER";

const jwt = await createSnowflakeJwt({ accountLocator, privateKeyPath, user });
const result = await submitHealthCall({ host, jwt });
process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
