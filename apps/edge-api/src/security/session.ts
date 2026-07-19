import { z } from "zod";

import { constantTimeEqual, hmacSha256, randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "__Host-ripple_session";
export const SESSION_MAX_AGE_SECONDS = 1800;

const sessionSchema = z.object({
  csrfHash: z.string().min(40).max(64),
  exp: z.number().int().positive(),
  iat: z.number().int().positive(),
  sessionNonce: z.string().min(20).max(64),
  sub: z.literal("operator"),
});

export type SessionPayload = z.infer<typeof sessionSchema>;

function encodeText(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeText(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("INVALID_SESSION");
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  try {
    return new TextDecoder().decode(
      Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)),
    );
  } catch {
    throw new Error("INVALID_SESSION");
  }
}

export async function deriveAccessCodeDigest(
  env: CloudflareBindings,
  code: string,
): Promise<string> {
  return hmacSha256(env.LOGIN_PEPPER, code);
}

export async function verifyAccessCode(env: CloudflareBindings, code: string): Promise<boolean> {
  const derived = await deriveAccessCodeDigest(env, code);
  return constantTimeEqual(derived, env.ACCESS_CODE_HMAC);
}

export async function createSession(
  env: CloudflareBindings,
  nowMilliseconds = Date.now(),
): Promise<{ csrfToken: string; expiresAt: string; token: string }> {
  const now = Math.floor(nowMilliseconds / 1000);
  const csrfToken = randomToken(16);
  const payload: SessionPayload = {
    csrfHash: await sha256(csrfToken),
    exp: now + SESSION_MAX_AGE_SECONDS,
    iat: now,
    sessionNonce: randomToken(16),
    sub: "operator",
  };
  const encoded = encodeText(JSON.stringify(payload));
  const signature = await hmacSha256(env.SESSION_SIGNING_SECRET, encoded);
  return {
    csrfToken,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    token: `${encoded}.${signature}`,
  };
}

export async function verifySession(
  env: CloudflareBindings,
  token: string,
  nowMilliseconds = Date.now(),
): Promise<SessionPayload | null> {
  const parts = token.split(".");
  const encoded = parts[0];
  const signature = parts[1];
  if (parts.length !== 2 || !encoded || !signature) return null;
  let expected: string;
  try {
    expected = await hmacSha256(env.SESSION_SIGNING_SECRET, encoded);
  } catch {
    return null;
  }
  if (!constantTimeEqual(expected, signature)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeText(encoded));
  } catch {
    return null;
  }
  const result = sessionSchema.safeParse(parsed);
  if (!result.success) return null;
  const now = Math.floor(nowMilliseconds / 1000);
  if (result.data.exp <= now || result.data.iat > now + 60) return null;
  return result.data;
}

export async function verifyCsrf(payload: SessionPayload, token: string): Promise<boolean> {
  const digest = await sha256(token);
  return constantTimeEqual(digest, payload.csrfHash);
}
