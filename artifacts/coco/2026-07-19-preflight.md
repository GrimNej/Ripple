# Sanitized CoCo preflight evidence

Date: 2026-07-19 NPT

CLI: Cortex Code 1.1.41

Scope: read-only Snowflake capability and least-privilege inspection

## Sanitized interaction summary

```text
Operator objective:
Inspect only the Ripple project footprint. Verify role grants, Python package/model
availability, embedding support, task/stream baseline, and cost guardrails. Do not
publish account identifiers, raw embeddings, secrets, or source content.

Observed:
- Application role: four intended usage/execute grants; no create or raw-data access.
- Project admin role: project ownership, task execution, Cortex user database role.
- Python runtime 3.11 exposed Snowpark packages.
- Bounded completion checks succeeded for the selected regional model family.
- One embedding probe returned a vector; vector contents discarded.
- One model family was unavailable regionally and one small model was deprecated.
- No project task/stream objects existed before the definitive probe.
- Warehouse monitor remained far below its five-credit suspension threshold.

Implementation review:
- Accepted the least-privilege grant inventory and regional model constraints.
- Independently verified actual AI_COMPLETE structured output; legacy COMPLETE was
  not treated as sufficient proof.
- Replaced the initially observed Snowpark 1.9.0 pin with verified 1.53.0 after the
  persistent Python procedure exposed a pkg_resources compatibility failure.
- Retained AI_EMBED outside P0 despite availability.
```

No raw CoCo session identifier, SQL query identifier, account locator, user identifier, full prompt, response vector, or secret is present in this artifact.
