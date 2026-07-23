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
- Transactional alerts send only from `ripple@notify.grimnej.com` to Cloudflare-verified destination addresses. Email Routing is enabled on that isolated subdomain only; the apex `grimnej.com` Zoho MX records are not part of Ripple's mail boundary.

## Secret handling

Never commit or log access codes, peppers, session/CSRF values, private keys, Snowflake JWTs, account identifiers, raw source content, or prompts containing raw source content. Local key material uses ignored file extensions/directories. Public CoCo evidence must be sanitized.

## Release controls

Required security gates include secret scanning, dependency advisory review, role-denial integration tests, session/CSRF/origin/body/upstream-poison API tests, prompt-injection fixtures, audit-chain verification, interruption/idempotency chaos tests, and CSP review.

Current evidence records 27 passing edge tests, eight web state/contract tests, and 32 Python tests. Literal Origin and CSRF rejection occurs before any Snowflake call; tampered and expired sessions are rejected; upstream responses are capped at 1 MiB; request bodies are capped at 300,000 bytes; and polling never resubmits a mutation. The GitHub adapter permits only public `github.com` repository URLs, safe exact paths, strict UTF-8 text, one resolved commit, eight assets, and bounded bytes. Live app-role probes confirmed access to approved secure views and denied direct core, audit, and raw-stage access. Playwright Chromium found no console errors across the five authenticated surfaces, proved the manual monitor action, and found no serious or critical violations at the tested desktop and mobile targets. Gitleaks 8.30.1 found no secret in 39 commits or the staged implementation diff.

There is deliberately no claim of durable global brute-force prevention: login failures share one visible response, the deployment URL remains private, and a global rate limiter will be added only if a verified free Cloudflare facility is available at deployment time.
