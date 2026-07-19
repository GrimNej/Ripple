# Capability preflight authorization record

**Status:** Approved by the owner and executed on 2026-07-19.

## Executed footprint

| Object                   | Purpose                                          | Cost/security effect                                                    |
| ------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------- |
| `RIPPLE_ADMIN_ROLE`      | Own project objects and run migrations/probes    | Project-scoped role; never used by the application                      |
| `RIPPLE_APP_ROLE`        | Execute fixed API procedures/read approved views | No create, raw stage, table mutation, or audit mutation access          |
| `RIPPLE_APP_USER`        | Edge SQL API service identity                    | Passwordless `TYPE=SERVICE`; dedicated RSA key                          |
| `RIPPLE_AUTOMATION_USER` | Unattended project migrations                    | Passwordless `TYPE=SERVICE`; separate RSA key; only `RIPPLE_ADMIN_ROLE` |
| `RIPPLE_WH`              | Build, bounded pipeline, and demo compute        | X-Small; 60-second auto-suspend; initially suspended                    |
| `RIPPLE_BUILD_MONITOR`   | Warehouse guardrail                              | Five credits; notify 80%; suspend immediately 100%                      |
| `RIPPLE` database        | Project namespace                                | Snowflake system of record                                              |
| `RIPPLE.PREFLIGHT`       | Disposable capability objects                    | Python procedure, two tables, stream, root/child tasks                  |
| `RIPPLE.API.HEALTH()`    | Fixed SQL API proof                              | App role has only usage and execute access                              |

The owner explicitly approved Snowflake provisioning, both local key generations, and future blueprint-scoped actions. Cross-region inference was not enabled. No Cloudflare secret or public deployment was created during preflight.

## Local key handling

Both private keys are unencrypted PKCS#8 only because Web Crypto and Snowflake CLI must import them non-interactively. They remain under the Git-ignored `.secrets/` directory. The application key will move into Cloudflare encrypted secrets at deployment; the automation key remains local and grants only the project admin role.

## Validation

Provisioning was followed by public-key SQL API authentication, a fixed owner-executed health call, strict-schema AI, Python, Stream/task, static export, Worker bundle/CPU, app-role grant, type/lint/test, and dependency-advisory checks. Results are in `docs/PREFLIGHT_REPORT.md`.

## Reversal boundary

Before P0 fixture data exists, the footprint can be removed in this order: suspend tasks, service users, database, warehouse, resource monitor, app role, admin role, and the two ignored local keys. Any teardown must be reviewed against the current rollback runbook before execution.
