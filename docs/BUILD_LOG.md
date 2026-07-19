# Build log

This is the consolidated implementation ledger. Times use Nepal Time (UTC+05:45). Secrets, account identifiers, raw source content, and unsanitized CoCo/Snowflake output must never appear here.

## 2026-07-19 11:42 NPT — Phase 0 workspace bootstrap

- **Goal:** Read the corrected blueprint completely, verify the local toolchain without cloud mutation, and establish the repository/documentation contract.
- **Files affected:** Root repository policy/configuration, `docs/`, and the blueprint-prescribed directory tree.
- **Commands:** Blueprint section extraction/full reads; local version checks for Git, Node, pnpm, Python, uv, Snowflake CLI, and Cortex Code; current official documentation checks; filesystem-only directory creation.
- **Test evidence:** The complete 2,635-line blueprint was read. Local versions found: Git 2.51.0, Node 24.14.0, pnpm 11.7.0, Python 3.11.0, uv 0.11.18, Snowflake CLI 3.23.0, and Cortex Code 1.1.41. No repository existed before this entry.
- **Decision or issue:** Phase 0 may proceed without provisioning. Snowflake resources/key generation require the next owner gate. The official CoCo executable is `cortex`, not `coco`.
- **Commit SHA:** Not applicable; this entry records work performed before repository initialization.
- **Rollback point:** Delete the newly created bootstrap files/directories while retaining the owner-supplied blueprint.

## 2026-07-19 11:55 NPT — Gated preflight resource plan

- **Goal:** Convert the first owner gate into an exact, reviewable, least-privilege resource/key plan without executing it.
- **Files affected:** `.gitignore`, `scripts/preflight_provision.sql`, and `docs/PREFLIGHT_APPROVAL.md`.
- **Commands:** Official Snowflake documentation review for CLI templating, service-user RSA keys, resource monitors, Cortex roles, and task privileges; local OpenSSL location/version check.
- **Test evidence:** Snowflake CLI 3.23.0 documents STANDARD `<% variable %>` templating; local OpenSSL 3.5.3 supports RSA/PKCS#8 generation. The script has not been submitted to Snowflake, as required by the approval gate.
- **Decision or issue:** Use a Git-ignored unencrypted PKCS#8 key for Web Crypto import, a passwordless `TYPE=SERVICE` user, a fixed owner-executed health procedure, and a 5-credit warehouse-only monitor. Cortex/serverless spend remains controlled separately.
- **Commit SHA:** `405ef1a` is the reviewed repository baseline preceding this plan.
- **Rollback point:** Revert the gated plan commit; no external state exists to unwind.

## 2026-07-19 12:20 NPT — Snowflake provisioning and unattended project identity

- **Goal:** Create the approved least-privilege Snowflake footprint, prove application key-pair authentication, and eliminate repeated human OAuth by adding a project-scoped automation identity.
- **Files affected:** `scripts/preflight_provision.sql`, `scripts/preflight_admin_automation.sql`, ignored `.secrets/` key material, and local Snowflake CLI configuration.
- **Commands:** OpenSSL RSA generation/validation; templated Snowflake provisioning; fixed Node SQL API health call; project automation connection creation/test.
- **Test evidence:** Roles, X-Small warehouse, five-credit monitor, database/schemas, app service user, and health procedure were created. The Node SQL API call returned HTTP 200. The automation identity authenticated by RSA and received only `RIPPLE_ADMIN_ROLE`.
- **Decision or issue:** Windows Credential Manager could not persist the human OAuth token. The project-scoped automation identity removes that dependency without granting `ACCOUNTADMIN` or using the exposed chat password.
- **Related commit:** `4c5005e`
- **Rollback point:** Remove the automation/app service users, then follow the preflight reversal order while no P0 fixture data exists.

## 2026-07-19 12:45 NPT — Mandatory capability preflight

- **Goal:** Execute all nine blueprint probes before building product features.
- **Files affected:** `snowflake/tests/preflight_capabilities.sql`, `scripts/preflight_sql_api.mjs`, and `apps/edge-api/`.
- **Commands:** Snowflake CLI capability script; local Node SQL API call; `cortex` read-only inspection; Next production build; Wrangler dry run/dev/startup profile; TypeScript, ESLint, Prettier, Vitest, and dependency audit.
- **Test evidence:** Python 3.11/Snowpark 1.53.0, strict `AI_COMPLETE`, `AI_EMBED`, append-only Stream plus root/child task execution, static export, real local Worker health call, 17.93 KiB gzip Worker, and 1.951 ms local p95 CPU proxy all passed. Audit reports no known vulnerabilities.
- **Decision or issue:** Snowpark 1.9.0 failed due to missing `pkg_resources`; verified 1.53.0 replaced it. All architecture fallbacks remain untriggered.
- **Related commit:** `4c5005e`
- **Rollback point:** `4c5005e`; Snowflake probe tasks are suspended and the warehouse auto-suspends.

## 2026-07-19 12:55 NPT — Static web and edge preflight stack lock

- **Goal:** Freeze the current supported Next/React/Hono/Cloudflare toolchain with reproducible generated types and zero-warning gates.
- **Files affected:** Root workspace configuration, `apps/web/`, `apps/edge-api/`, lockfile, lint/format config, and ignored local Worker configuration generator.
- **Commands:** `pnpm install`, `wrangler types`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm audit --audit-level moderate`.
- **Test evidence:** All commands passed. Current Workers types matched 5.20260719.1. PostCSS was forced to patched 8.5.19 after an advisory surfaced in Next's transitive pin.
- **Decision or issue:** Keep the minimal reviewed Web Crypto JWT implementation; adding a JWT library is unnecessary at the measured bundle/CPU cost.
- **Related commit:** `4c5005e`
- **Rollback point:** Revert `4c5005e` while retaining the Snowflake provisioning rollback procedure.

## 2026-07-19 13:50 NPT — Deterministic Snowflake foundation

- **Goal:** Deliver the Phase 2 schema, disclosed golden fixture, hash-verified snapshot flow, versioned normalization/sectioning, deterministic section diff, and validated three-atom extraction.
- **Files affected:** Python/Snowpark procedures and tests, paired migrations and manifest, `benchmark/`, reproducibility scripts, Python lock/configuration, and project ledgers.
- **Commands:** `uv sync`; Ruff, mypy, pytest, and SQLFluff gates; manifest/hash verifiers; reviewed forward migrations; stage uploads; `CORE.FINALIZE_SNAPSHOT`; `CORE.DIFF_SNAPSHOTS`; repeated idempotency seed.
- **Test evidence:** Fifteen unit/property tests pass. Both disclosed source snapshots finalized from scoped stage URLs with exact byte/SHA checks. The live comparison produced three changed sections and exactly three `VALID` deterministic atoms. A second full seed reused the existing three section diffs and created no duplicate snapshots or atoms.
- **Decision or issue:** Snowflake rejected a multi-column inline `CHECK`; offsets remain protected by trusted code, half-open-span property tests, size caps, and integration evidence. The failed first migration attempt created only empty idempotent objects and was corrected/re-hashed before the migration was recorded as applied. Windows OAuth credential persistence was repaired by disabling the failing temporary Credential Manager write; the account-owner connection then tested successfully.
- **Related commits:** `035b88b`, `f84d0f3`, `eac92e0`, `36b1df0`, `428377d`
- **Rollback point:** Paired migrations `002`, then `001`, after explicitly accepting loss of disclosed fixture/run data; complete teardown follows `scripts/teardown_snowflake.sql` and the rollback runbook.
