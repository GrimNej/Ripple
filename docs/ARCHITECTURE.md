# Architecture

## Decision

Ripple uses a statically exported Next.js application and one small Hono Cloudflare Worker. The Worker authenticates the single operator, enforces CSRF/origin/input contracts, creates Snowflake key-pair JWTs, and calls only fixed stored procedures/read views through the Snowflake SQL API. Snowflake owns all domain state, orchestration, AI execution, immutable asset versions, deterministic verification, and audit history.

## Trust boundaries

```text
Untrusted browser and source text
        ↓ validated HTTPS contracts
Cloudflare Worker security/API boundary
        ↓ fixed procedure allowlist + key-pair JWT
Snowflake API schema
        ↓ owner-executed procedures
RAW → CORE → PIPELINE → APP → OPS/EVAL
```

- The browser never receives Snowflake credentials and never contacts Snowflake directly.
- The Worker executes no arbitrary SQL, AI, parsing, graph traversal, or in-memory business workflow.
- The application role cannot read raw staged files, create objects, or update/delete audit history.
- Administrative Snowflake roles remain an explicitly documented audit trust-boundary limitation.

## Authoritative state transitions

Pipeline stages use compare-and-set transitions, deterministic stage keys, persisted outputs, and one Snowflake Stream/task graph. Browser timeouts never authorize resubmission; the original Snowflake statement handle is polled.

Patch approval atomically wins the patch CAS, checks the active asset version, inserts one new asset-version row, advances the current pointer, records the review, appends the audit event, and stores the idempotent replay response. Deterministic change-specific checks alone may mark the patch `VERIFIED`.

## Scope constraints

P0 accepts disclosed UTF-8 Markdown/plain text snapshots no larger than 1 MiB and assets no larger than 256 KiB. It recognizes only version requirements, endpoint replacements/deprecations, and numeric limits. The pipeline is bounded to three change atoms, twelve candidates, one AI retry, and six patches per event.

The detailed data model, route list, security controls, failure behavior, and acceptance gates remain canonical in `RIPPLE_IMPLEMENTATION_BLUEPRINT_CORRECTED.md`.
