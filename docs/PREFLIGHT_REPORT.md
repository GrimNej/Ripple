# Capability preflight report

**Status:** PASS

**Completed:** 2026-07-19 NPT

**Rollback point:** `4c5005e`

All nine mandatory capability probes passed in the target account and local runtime. No fallback architecture is required.

## Results

|   # | Capability                                  | Sanitized evidence                                                                                                            | Result                |
| --: | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------- |
|   1 | Narrow Snowflake role and X-Small warehouse | Project admin/app roles, passwordless service user, X-Small auto-suspend warehouse, and five-credit warehouse monitor created | PASS                  |
|   2 | Local Node key-pair SQL API                 | Fixed `CALL RIPPLE.API.HEALTH()` returned HTTP 200 with one row and a statement handle                                        | PASS                  |
|   3 | Snowpark Python 3.11                        | Owner-executed procedure returned runtime `3.11`, probe value `1`, and `PYTHON_3_11_OK`                                       | PASS                  |
|   4 | Strict-schema `AI_COMPLETE`                 | `mistral-large2` returned only the required `capability` and `status: PASS` fields                                            | PASS                  |
|   5 | Stream/root/child task graph                | Append-only stream produced one root and one child result; both task-history rows were `SUCCEEDED` with no error              | PASS                  |
|   6 | `AI_EMBED`                                  | A bounded `e5-base-v2` embedding expression returned non-null                                                                 | PASS, held outside P0 |
|   7 | Static Next.js export                       | Next.js 16.2.10 generated only static routes and a Cloudflare-compatible `out/` directory                                     | PASS                  |
|   8 | Local Hono Worker → Snowflake               | Local Worker returned HTTP 200 with `static-next-hono-snowflake` and Snowflake status `ok`                                    | PASS                  |
|   9 | Worker bundle and CPU                       | Dry-run upload 71.32 KiB / 17.93 KiB gzip; 200-request local network-mocked p95 wall-time proxy 1.951 ms                      | PASS                  |

The CPU measurement includes Hono routing, RSA key import/signing, request construction, bounded response parsing, and response serialization while replacing only upstream network wait. It is a conservative local proxy, not a claim about Cloudflare production hardware. Wrangler's alpha startup profiler also completed successfully; its local profile spanned 39.116 ms, below the platform's startup limit.

## Commands run

Identifiers and local connection names are intentionally omitted.

```text
snow sql --filename scripts/preflight_provision.sql --enable-templating STANDARD
node scripts/preflight_sql_api.mjs
cortex --sql-read-only --bypass --no-mcp
snow sql --filename snowflake/tests/preflight_capabilities.sql
pnpm build
pnpm --filter @ripple/edge-api cf-typegen:check
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm audit --audit-level moderate
wrangler check startup
wrangler dev --port 8787
```

## Corrected finding

The first persistent Python 3.11 probe used Snowpark 1.9.0 and failed because that older build imported unavailable `pkg_resources`. The account exposed Snowpark 1.53.0 for Python 3.11; pinning 1.53.0 made the same procedure pass. This is recorded as a preflight-discovered compatibility correction, not hidden as a transient failure.

## Models and regional limits

- `mistral-large2` passed the required current `AI_COMPLETE` structured-output call and is the P0 default pending the benchmark gate.
- Bounded availability checks also succeeded for `llama3.1-70b`, `llama3.3-70b`, and `mistral-7b`.
- One Claude model was unavailable in the account region and one small Llama model was deprecated; neither is selected.
- Cross-region inference remains disabled. P0 must succeed with models available in the account's existing AWS Asia-Pacific region.
- `AI_EMBED` is available but remains optional P1. Exact and lexical retrieval stay sufficient for P0.

## Security and cost controls

- Application and automation identities are passwordless `TYPE=SERVICE` users with separate ignored RSA keys.
- The automation identity receives only `RIPPLE_ADMIN_ROLE`, never `ACCOUNTADMIN`; the application identity receives only the narrow app role.
- Cloudflare receives no secret until deployment. Local Worker values live only in the ignored `.dev.vars` file.
- The app role can execute only the fixed health procedure at this phase and cannot create project objects.
- The warehouse is X-Small, initially/automatically suspended after 60 seconds, and attached to the five-credit monitor.
- AI calls were bounded to tiny prompts and output caps. Exact AI credit telemetry requires an account-usage privilege that is intentionally absent from the project role; this visibility limitation is recorded in the cost ledger.

## Frozen decisions

| Decision                         | Outcome                                                               |
| -------------------------------- | --------------------------------------------------------------------- |
| `AI_COMPLETE` unavailable        | Not triggered; required capability passed                             |
| Triggered task graph unavailable | Not triggered; stream/root/child graph passed                         |
| `AI_EMBED` unavailable           | Not triggered; capability passed but remains outside P0               |
| Next.js + Hono exceeds limits    | Not triggered; static export and 17.93 KiB gzip Worker passed         |
| JWT implementation               | Retain reviewed Web Crypto implementation; no JWT dependency required |

The architecture is therefore frozen as static Next.js assets + Hono Worker + fixed Snowflake SQL API allowlist + Snowflake Stream/task graph.
