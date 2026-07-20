# CoCo usage log

CoCo is installed as `cortex` version 1.1.41. Published evidence is sanitized: no account identifiers, user names, query/session IDs, secrets, raw embeddings, or full prompts are retained.

## 2026-07-19 — Snowflake capability and least-privilege inspection

- **Goal:** Use CoCo meaningfully to inspect the provisioned Snowflake footprint, probe Cortex/model/package availability, and review least-privilege/cost constraints before product implementation.
- **Mode:** Read-only SQL tools, no MCP, bounded turn count.
- **Inspected:** Project/app role grants, service-user boundary, warehouse monitor state, Python 3.11 Snowpark packages, Cortex completion/embedding availability, and absence of pre-existing project tasks/streams.
- **Accepted:** The app role had only four intended grants; `mistral-large2` and two larger Llama models were callable; `e5-base-v2` embedding was available; cross-region inference was unnecessary.
- **Edited after deterministic verification:** CoCo surfaced Snowpark 1.9.0 as available, but the persistent Python probe failed on its obsolete `pkg_resources` dependency. The implementation rejected that pin and selected verified Snowpark 1.53.0.
- **Rejected as proof:** A legacy `CORTEX.COMPLETE` structured response was not accepted as the required `AI_COMPLETE` proof. The definitive script later executed the actual `AI_COMPLETE` function successfully.
- **Persistent mutation:** None from CoCo. A session-scoped temporary function vanished with the session; persistent procedure creation under the wrong primary role failed harmlessly.
- **Artifact:** [sanitized preflight evidence](../artifacts/coco/2026-07-19-preflight.md)
- **Related implementation commit:** `4c5005e`

## 2026-07-19 — Phase 3 review attempt

- **Goal:** Have CoCo independently inspect the deployed task graph and then perform a repository-only architecture review of the bounded AI implementation.
- **Mode:** Read-only SQL/repository access, no MCP, no mutation permissions, bounded turns.
- **Result:** Both attempts stopped before review because the CoCo process required browser authentication and its callback timed out. No repository or Snowflake state was changed.
- **Decision:** Do not weaken authentication or grant a broader role. Phase 3 was gated through the unattended project automation identity, executable task history, persisted stage/AI/finding counts, paired migrations, and local static/property tests. A successful CoCo Phase 3 review remains required before submission freeze.

## 2026-07-20: Product secure-view review attempt

- **Goal:** Ask CoCo to inspect `API.RUN_PATCH_V` and `API.PATCH_DETAIL_V` for single-row latest-verification semantics, content minimization, and fixed-allowlist suitability.
- **Mode:** Read-only Snowflake metadata/count queries, no MCP, no edit/write/shell tools, bounded turns, and explicit identifier/content redaction.
- **Result:** Print mode and non-interactive execution each stopped at the bounded 120-second browser-authentication callback timeout. No review output or persistent mutation was produced.
- **Accepted, edited, or rejected:** Nothing was accepted, edited, or rejected because CoCo produced no conclusion.
- **Independent evidence:** Migration lint/hash verification, application-role secure-view reads, 23 edge tests, five live browser surfaces, and one UI-driven atomic apply plus deterministic verification all pass.
- **Artifact:** [sanitized attempt evidence](../artifacts/coco/2026-07-20-product-view-review-attempt.md)
- **Related implementation commits:** `9aeb3fb`, `623beb4`, `8dd7b8f`
- **Decision:** Preserve the authentication boundary and keep a successful CoCo review as a submission-freeze gate.

## 2026-07-20: Authenticated product secure-view review

- **Goal:** Independently verify the single-row latest-verification projection, content-minimized run-patch list, and fixed-allowlist suitability of the two production secure views.
- **Mode:** Human-authenticated Snowflake connection, built-in SQL read-only guard, no MCP, bounded turns, metadata and aggregate queries only, and explicit content/identifier redaction.
- **Accepted:** `PATCH_DETAIL_V` returned no patch with more than one projected verification row; deterministic ordering resolves timestamp ties. `RUN_PATCH_V` omits proposed content, asset bodies, evidence payloads, and raw files. Both secure views are suitable for the Worker's fixed read allowlist.
- **Checked without edit:** CoCo warned that patch detail contains full review content. The Worker already keeps this endpoint authenticated, uncached, and absent from structured logs, so no code change was required.
- **Rejected from P0:** A future multi-tenant row-level-security requirement was not promoted because Ripple's approved P0 boundary is one private operator.
- **Persistent mutation:** None.
- **Artifact:** [sanitized secure-view review](../artifacts/coco/2026-07-20-product-view-review.md)
- **Related implementation commits:** `9aeb3fb`, `623beb4`, `8dd7b8f`

## 2026-07-20: Live monitor review attempt

- **Goal:** Ask CoCo to independently review migration `011` and the live monitor Snowpark handler for Snowflake syntax, compare-and-set concurrency, retry safety, immutable snapshot integrity, and least privilege.
- **Mode:** Existing automation connection, built-in SQL read-only guard, no MCP, bounded turns, repository files only, and explicit identifier/content redaction.
- **Result:** CoCo stopped at the 120-second browser-authentication callback timeout even though the separate Snowflake CLI key-pair identity remained healthy. No repository or Snowflake state was changed.
- **Accepted, edited, or rejected:** No CoCo conclusion was available to accept. Deterministic review independently caught and fixed exact-content hash preservation before a monitor could be created. Live concurrency/idempotency structure, migration compilation, and end-to-end execution were then verified directly.
- **Artifact:** [sanitized live-monitor review attempt](../artifacts/coco/2026-07-20-live-monitor-review-attempt.md)
- **Related implementation commit:** `6172158`
- **Decision:** Do not request another owner login or weaken authentication. Preserve the successful authenticated secure-view CoCo evidence and record this attempt honestly.
