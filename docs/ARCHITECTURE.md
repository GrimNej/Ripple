# Architecture

## Decision

Ripple uses a statically exported Next.js application and one small Hono Cloudflare Worker. The Worker authenticates the single operator, enforces CSRF, origin, and input contracts, creates Snowflake key-pair JWTs, and calls only fixed stored procedures and read views through the Snowflake SQL API. Snowflake owns all domain state, orchestration, AI execution, immutable asset versions, deterministic verification, and audit history.

The Worker also implements one bounded source adapter for public GitHub repositories. It accepts only `https://github.com/{owner}/{repository}`, validates exact UTF-8 paths, resolves the configured branch to one commit, and fetches the authoritative file plus at most eight downstream files pinned to that commit. It does not accept arbitrary hosts or crawl repositories.

## Trust boundaries

```text
Untrusted browser and source text
        | validated HTTPS contracts
Cloudflare Worker security/API boundary
        | bounded GitHub reads + fixed procedure allowlist + key-pair JWT
Snowflake API schema
        | owner-executed procedures
RAW -> CORE -> PIPELINE -> APP -> OPS/EVAL
```

- The browser never receives Snowflake credentials and never contacts Snowflake directly.
- Monitor configuration is created in the browser and persisted in Snowflake. No server-side repository registration is required.
- A Cloudflare Cron trigger wakes every 15 minutes, but Snowflake's due-monitor view admits only enabled monitors whose 12 or 24 hour interval has elapsed. Operators can trigger the same bounded check immediately.
- The Worker executes no arbitrary SQL, AI, parsing, graph traversal, or in-memory business workflow.
- The application role selects only approved secure views and executes fixed API procedures. Live denial probes confirm it cannot read raw staged files, core tables, or the audit table.
- Administrative Snowflake roles remain an explicitly documented audit trust-boundary limitation.

## Authoritative state transitions

Every GitHub capture stores the exact content hash, immutable commit URL, normalized snapshot, sections, and monitor check result. A compare-and-set update on the monitor's prior commit permits one changed capture to win. If run creation fails after capture, the unresolved source pair is persisted and safely retried with a deterministic idempotency key.

Pipeline stages use compare-and-set transitions, deterministic stage keys, persisted outputs, and one Snowflake Stream/task graph. Browser timeouts never authorize mutation resubmission; the original Snowflake statement handle is polled.

The edge client caps parsed upstream bodies at 1 MiB and result sets at 200 rows, validates unknown Snowflake envelopes with Zod, uses bound values for browser-controlled IDs and content, and exposes no arbitrary SQL or object-name endpoint. A submission transport failure becomes an explicit unknown outcome. Once a handle exists, retries poll only that handle.

Patch approval atomically wins the patch CAS, checks the active asset version, inserts one new asset-version row, advances the current pointer, records the review, appends the audit event, and stores the idempotent replay response. Deterministic change-specific checks alone may mark the patch `VERIFIED`.

## Scope constraints

The current approved scope accepts UTF-8 Markdown/plain-text authoritative files no larger than 1 MiB and up to eight downstream assets of 256 KiB each, with a 2 MiB total capture. It recognizes only version requirements, endpoint replacements/deprecations, and numeric limits. The pipeline is bounded to three change atoms, five candidates per atom, twelve candidates per event, one AI retry, six patches per event, and two admitted AI credits per development day.

The detailed data model, route list, security controls, failure behavior, and acceptance gates remain canonical in `RIPPLE_IMPLEMENTATION_BLUEPRINT_CORRECTED.md`.
