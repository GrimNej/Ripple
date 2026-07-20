# Cost ledger

## Guardrails

| Control                      |                                        P0 limit |
| ---------------------------- | ----------------------------------------------: |
| Additional spend             |                                           USD 0 |
| Development AI admission cap |                                2 AI credits/day |
| Demo reserve                 |     At least 70% of remaining Snowflake balance |
| Warehouse monitor            | 5 credits; notify 80%, suspend immediately 100% |
| Public unauthenticated AI    |                                         0 calls |

Resource monitors govern warehouse usage only. Cortex/serverless use is controlled by bounded inputs, token caps, daily admission state, and account-usage review.

## Usage

| Date (NPT) | Slice                           |                                  Warehouse credits | AI credit visibility                       | Evidence / note                                                                           |
| ---------- | ------------------------------- | -------------------------------------------------: | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 2026-07-19 | Phase 0 local bootstrap         |                                                  0 | 0                                          | Local reads only                                                                          |
| 2026-07-19 | Provisioning and CoCo preflight |                                      0.02 observed | Exact project-role view unavailable        | Five-credit monitor reading after bounded inspection; no cross-region inference           |
| 2026-07-19 | Definitive capability probes    |        Metering view returned 0.0000 at query time | Telemetry pending account-usage visibility | Tiny strict-schema completion and one embedding probe; result may lag metering            |
| 2026-07-19 | Worker health probes            |                      Included above / metering lag | 0                                          | Fixed read-only health calls only                                                         |
| 2026-07-19 | Deterministic foundation gate   | Bounded X-Small execution; exact telemetry pending | 0                                          | Two snapshot finalizations, one diff, and one replay; no Cortex call                      |
| 2026-07-19 | Bounded AI/task-graph gate      | Bounded X-Small execution; exact telemetry pending | Exact project-role telemetry unavailable   | One final golden run; two successful structured calls; 2-credit/day admission cap         |
| 2026-07-19 | Atomic patch/concurrency gate   | Bounded X-Small execution; exact telemetry pending | 0                                          | Twenty concurrent apply calls, replay checks, and deterministic verification              |
| 2026-07-19 | Authenticated edge API gate     | Bounded X-Small execution; exact telemetry pending | 0                                          | Health/read-model and four least-privilege boundary probes; no Cortex call                |
| 2026-07-20 | Product UI and browser gate     |      Bounded X-Small reads and one approved repair | 0                                          | Five live surfaces, one atomic apply, and deterministic verification; no AI call          |
| 2026-07-20 | Cloudflare production release   |                 Bounded X-Small read-only requests | 0                                          | Worker, static assets, custom domain, and live browser acceptance; no paid resource added |

The project role intentionally lacks broad `SNOWFLAKE.ACCOUNT_USAGE` access. Current Snowflake guidance places per-call AI credits in `CORTEX_AI_FUNCTIONS_USAGE_HISTORY`; that query must be run by an appropriately governed account-usage role before submission freeze. Until then, admission is bounded by call count and token limits and no claim of exact AI credits is made.
