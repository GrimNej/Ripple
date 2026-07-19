# Dependency ledger

No direct JavaScript or Python runtime/build dependency is installed in Phase 0. New direct dependencies require exact version, licence, official source, purpose, execution role, and advisory-check evidence before the initial stack lock; additions after that lock require owner approval.

## Direct dependencies

| Workspace | Package | Exact version | Licence | Official source | Reason | Role | Advisory checked |
|---|---|---|---|---|---|---|---|
| — | None installed | — | — | — | Phase 0 is documentation/repository bootstrap only | — | 2026-07-19 |

## Local toolchain baseline

| Tool | Exact local version | Role |
|---|---:|---|
| Git | 2.51.0.windows.2 | Version control |
| Node.js | 24.14.0 | JavaScript runtime target |
| pnpm | 11.7.0 | Workspace package manager |
| Python | 3.11.0 | Snowpark/tooling runtime target |
| uv | 0.11.18 | Python environment/package runner |
| Snowflake CLI | 3.23.0 | Snowflake scripting and verification |
| Cortex Code CLI | 1.1.41 | Required substantive CoCo work |
