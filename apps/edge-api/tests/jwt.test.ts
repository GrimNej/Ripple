import { generateKeyPairSync, verify } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createSnowflakeJwt } from "../src/snowflake/jwt";

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function splitJwt(value: string): [string, string, string] {
  const parts = value.split(".");
  const header = parts[0];
  const payload = parts[1];
  const signature = parts[2];
  if (parts.length !== 3 || !header || !payload || !signature) {
    throw new Error("Test JWT did not contain three non-empty segments.");
  }
  return [header, payload, signature];
}

describe("createSnowflakeJwt", () => {
  it("creates a bounded RS256 token with normalized Snowflake claims", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" });
    const publicKeyPem = publicKey.export({ format: "pem", type: "spki" });
    const token = await createSnowflakeJwt(
      {
        SNOWFLAKE_ACCOUNT_LOCATOR: "xy12345",
        SNOWFLAKE_PRIVATE_KEY: privateKeyPem,
        SNOWFLAKE_PUBLIC_KEY_FINGERPRINT: "test-fingerprint",
        SNOWFLAKE_USER: "ripple_app_user",
      },
      Date.UTC(2026, 6, 19, 12),
    );

    const [encodedHeader, encodedPayload, encodedSignature] = splitJwt(token);
    expect(JSON.parse(decodeBase64Url(encodedHeader))).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(decodeBase64Url(encodedPayload))).toMatchObject({
      iss: "XY12345.RIPPLE_APP_USER.SHA256:test-fingerprint",
      sub: "XY12345.RIPPLE_APP_USER",
    });
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${encodedHeader}.${encodedPayload}`),
        publicKeyPem,
        Buffer.from(encodedSignature, "base64url"),
      ),
    ).toBe(true);
  });
});
