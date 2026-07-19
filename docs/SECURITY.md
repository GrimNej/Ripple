# Security model

## Identity and session

Ripple is a private single-operator application. The Worker compares an HMAC-SHA-256 digest of a random 128-bit access code using constant-time comparison. It issues a 30-minute, HMAC-signed, HttpOnly, Secure, SameSite=Strict cookie containing only operator identity, issuance/expiry, CSRF hash, and a random session nonce.

Every mutation requires the plaintext CSRF token in `X-Ripple-CSRF`; the Worker hashes it, compares it with the signed-session value, and verifies the exact production Origin before contacting Snowflake. Stateless logout cannot centrally revoke an issued cookie, so emergency invalidation rotates the session-signing secret.

## Platform boundary

- The Snowflake private key and session/authentication secrets exist only in local secure configuration or Cloudflare secrets, never in browser bundles or Git.
- The application and project-automation identities use separate RSA keys. Automation has only `RIPPLE_ADMIN_ROLE`; neither service identity receives `ACCOUNTADMIN`.
- The Worker uses a narrow service user and a fixed stored-procedure/view allowlist. It returns stable error envelopes, never upstream HTML, SQL, stack traces, raw Snowflake errors, secrets, or private identifiers.
- Source/asset text is untrusted and rendered only through React escaping. Raw HTML and `dangerouslySetInnerHTML` are prohibited.
- AI has no tools/network, receives explicit untrusted-content boundaries, returns a strict schema, and cannot confirm evidence until server-side offset/hash validation passes.
- Compare-and-set state, expected versions, request hashes, and idempotency replay defend every mutation.
- Patch apply first wins a proposal CAS, then creates and activates one immutable asset version in the same explicit transaction. A singleton CAS audit head prevents concurrent successful mutations from forking the tamper-evident chain.

## Secret handling

Never commit or log access codes, peppers, session/CSRF values, private keys, Snowflake JWTs, account identifiers, raw source content, or prompts containing raw source content. Local key material uses ignored file extensions/directories. Public CoCo evidence must be sanitized.

## Release controls

Required security gates include secret scanning, dependency advisory review, role-denial integration tests, session/CSRF/origin/body/upstream-poison API tests, prompt-injection fixtures, audit-chain verification, interruption/idempotency chaos tests, and CSP review.

Phase 5 evidence records 21 passing edge tests, literal Origin and CSRF rejection before any Snowflake call, tampered/expired-session rejection, a 1 MiB upstream cap, a 300,000-byte request cap, same-handle polling without mutation resubmission, and stable redaction of poisoned upstream responses. Live app-role probes confirmed access to an approved secure view and denied direct core, audit, and raw-stage access.

There is deliberately no claim of durable global brute-force prevention: login failures share one visible response, the deployment URL remains private, and a global rate limiter will be added only if a verified free Cloudflare facility is available at deployment time.
