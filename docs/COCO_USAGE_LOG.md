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
