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

## 2026-07-19 14:17 NPT — Task graph and bounded AI

- **Goal:** Deliver Phase 3 orchestration with one Stream/task graph, deterministic stage identities, bounded structured AI, server-validated evidence, persisted retries, daily admission control, and review-patch preparation.
- **Files affected:** Pipeline Python modules/tests, forward/rollback migrations `003` and `004`, migration manifest, and project evidence ledgers.
- **Commands:** Ruff, strict mypy, pytest; stage upload and procedure/task recreation; scheduled root-task execution with one injected retrieval failure; persisted result/task-proof queries; replay calls; bounded read-only CoCo review attempts.
- **Test evidence:** Nineteen local tests pass. The fresh live run completed all seven stages; retrieval completed on attempt two; both structured AI calls succeeded; eight candidates yielded six `CONFIRMED`, one `REJECTED`, and one `UNCERTAIN`; three review patches and one child-task proof were persisted. Start/run replay returned the prior result without duplicate work.
- **Decision or issue:** Snowflake structured output rejects JSON Schema `maxItems`, so caps remain enforced by bounded candidate construction and server-side validators. Content-free stage checkpoints preserve useful failure codes without exposing exception/model data. CoCo review attempts were blocked by browser-auth callback timeout and remain a submission-freeze item; the unattended project identity and live gate were unaffected.
- **Related commits:** `c9afe3f`, `442f3c7`, `c2b6816`, `b59bf68`, `48d2774`
- **Rollback point:** Paired migrations `004`, then `003`, after accepting loss of Phase 3 task/run evidence; Phase 2 remains independently reversible.

## 2026-07-19 14:51 NPT — Atomic patch application and deterministic verification

- **Goal:** Deliver editable append-only patch revisions, transactional apply/reject boundaries, immutable asset-version activation, idempotent replay, deterministic verification, and concurrency-safe audit evidence.
- **Files affected:** Pure verification/audit Python, SQL/Scripting mutation procedures, paired migrations `005`–`007`, migration manifest, live integration harness, and evidence ledgers.
- **Commands:** Ruff, strict mypy, pytest, SQLFluff, manifest/fixture verification; stage uploads and forward migrations; twenty independent concurrent Snowflake connections calling `API.APPLY_PATCH`; replay/conflict/verification calls; full audit-chain recomputation.
- **Test evidence:** Twenty-five local tests pass. Of twenty simultaneous unique apply keys, exactly one returned `PATCH_APPLIED` and nineteen returned `PATCH_ALREADY_DECIDED`. The winning key replayed byte-equivalent structured output; an altered request with that key returned `IDEMPOTENCY_CONFLICT`. Persisted state contains one active repair version, one apply decision, one apply audit event, one replay row, and one `VERIFIED` result with zero failed deterministic checks. All 22 audit events and the CAS head validate.
- **Decision or issue:** The first historical audit row stored the Python `None` binding as a literal string while hashing the correct genesis marker. The append-only row was preserved; the verifier normalizes only that sequence-one legacy representation. Forcing UTF-8 output also avoids a Windows Snowflake CLI renderer crash when Rich converts `:ok:` to a Unicode glyph.
- **Related commits:** `91b23de`, `da5fd31`, `f4c2ef7`
- **Rollback point:** Paired migrations `007`, `006`, then `005`; immutable foundation rows remain unless the destructive Phase 2 rollback is also selected.

## 2026-07-19 15:30 NPT — Authenticated edge API boundary

- **Goal:** Deliver the complete Phase 5 Hono boundary with access-code authentication, signed sessions, CSRF/origin enforcement, fixed Snowflake SQL, asynchronous statement polling, secure read models, and stable redacted envelopes.
- **Files affected:** Edge runtime/contracts/security/tests, dependency lock and ledger, migration `008` and manifest, Worker binding examples/types, and security/architecture evidence.
- **Commands:** TypeScript/ESLint/Prettier/Vitest gates; Python/Ruff/mypy/pytest and SQLFluff gates; Wrangler type check and dry-run build; authenticated local Worker calls to live Snowflake; app-role allow/deny SQL API probes; migration-ledger insertion; deterministic Python formatting followed by scoped stage upload and procedure re-registration.
- **Test evidence:** Twenty-one edge tests pass with a 1.609 ms local p95 wall-time proxy, alongside 25 Python tests. The bundle is 105.68 KiB gzip. A real local Worker session returned HTTP 200 for health, dashboard, and proof. The app role selected its approved secure view while direct core-table, audit-table, and raw-stage probes each failed with HTTP 422. Mutation defenses reject missing CSRF, wrong Origin, invalid/oversized JSON, and poisoned upstream bodies; async tests prove one submission followed by same-handle polling through `202`, `429`, `5xx`, and a transient network failure. Re-registered procedures returned a healthy status and one proof row.
- **Decision or issue:** Origin comparison is literal. Submission network failure is reported as an unknown outcome and is never automatically resubmitted; once a handle exists, all retries poll only that handle. Stateless sessions retain the documented revocation limitation, and no unverified global rate-limiting claim is made.
- **Related commits:** `81aec91`, `d83e4b4`, `5ca8696`
- **Rollback point:** Revert the edge commit and apply paired rollback migration `008`; rotate/delete local auth material only if deliberately invalidating existing sessions.

## 2026-07-19 15:55 NPT — Visual research and owner lock

- **Goal:** Complete the blueprint-mandated live design study, keep two visual hypotheses distinct, and produce one Command Center and Patch Review mock for each direction before production UI coding.
- **Files affected:** `docs/VISUAL_DIRECTION.md`, `design/visual-lock/`, and ignored local Playwright research output.
- **Commands:** Current official-site search and page inspection; Chromium snapshots at 1440×900; focused HTML/CSS mock composition; exact PNG dimension verification; manual visual review.
- **Test evidence:** Ten references cover editorial data, visual journalism, developer infrastructure, observability/incident response, version-control diff, lineage, and museum/publication design. Four rendered mocks are exactly 1440×900 and use the real disclosed golden-scenario claims and Phase 5 read-model fields.
- **Decision or issue:** Direction A, Editorial Systems Cartography, is recommended because it makes evidence and causality more ownable and avoids collapsing into a familiar developer dashboard. Production UI remains intentionally paused until the owner selects A or B; the directions will not be indiscriminately blended.
- **Related commit:** `6b871e5`
- **Rollback point:** Remove the isolated `design/visual-lock/` artifacts and restore the prior research-status document; no production UI or external platform state changed.

## 2026-07-19 16:40 NPT — Visual direction round 2 and product identity

- **Goal:** Replace both owner-rejected directions with two premium, template-informed but original product systems; expand each system to include a public landing page; and make the repository front page present Ripple as an enduring product.
- **Files affected:** `design/visual-lock/round-2.*`, six 1440 x 900 owner-review captures, `docs/VISUAL_DIRECTION.md`, `README.md`, and four original README SVG assets under `docs/assets/`.
- **Commands:** Current Framer/Webflow marketplace and live product research; real Chromium inspection of template motion, pointer response, typography, and product staging; interactive HTML/CSS/JS composition; 1440 x 900 Playwright rendering; apply-state interaction test; fresh-console inspection; standalone SVG rendering through a GitHub-equivalent HTML image wrapper; exact image-dimension verification.
- **Test evidence:** Ten new references were recorded with source, date, learned principle, non-copy boundary, and accessibility observation. Direction C and Direction D each include a landing page, Command Center, and Patch Review. All six captures are exactly 1440 x 900. The patch action transitions to a disabled verified state, the final browser session reports zero console errors or warnings, every animation has a reduced-motion resolution, and the logo, banner, animated flow, and architecture SVGs render without clipping.
- **Decision or issue:** The owner explicitly rejected Directions A and B, so they are historical artifacts only. Public-facing product copy now excludes event, demo, prototype, and golden-scenario language. Direction C is recommended, but production frontend implementation remains paused until the owner chooses C or D.
- **Related commit:** `3c3b16d`
- **Rollback point:** Revert the round-2 artifact commit to restore the prior README and visual research record; no production frontend or external platform state changed.

## 2026-07-20 12:59 NPT: Direction C production product

- **Goal:** Implement the owner-selected Cinematic Signal direction as a complete landing page, private authentication flow, and five live product surfaces while preserving Ripple's exact P0 action boundary.
- **Files affected:** `apps/web/`, edge session and run-patch routes, migrations `009` and `010`, visual and security ledgers, official-session traceability, and browser baselines.
- **Commands:** Next static production build; Wrangler dry run and local runtime; Vitest web/edge suites; Playwright Chromium at 1440 x 900 and 390 x 844; axe scans; live authenticated Snowflake reads; one UI-driven patch apply and deterministic verify; SQLFluff and migration-manifest verification.
- **Test evidence:** Seven web tests and 23 edge tests pass. All five authenticated surfaces rendered live Snowflake data with zero browser errors. Both landing visual baselines pass, mobile navigation is keyboard operable, and axe reports no serious or critical violations. One numeric-limit repair created one immutable asset version atomically and reached `VERIFIED` through deterministic checks. The Impact View graph/list expose the same eight relationships.
- **Decision or issue:** The owner selected Direction C. A restrained 1 to 1.5 px lift and higher-contrast quiet token improved small-copy legibility without changing headline scale or information density. Browser inspection found that Snowflake rejected the original correlated subquery inside `PATCH_DETAIL_V`; migration `010` replaced it with a window-ranked join. The final proof audit also reconciled deployment receipts for migrations `009` and `010`, bringing the live and immutable manifest counts to ten. No production security boundary was widened.
- **Related commits:** `9aeb3fb`, `623beb4`, `8dd7b8f`
- **Rollback point:** Revert `8dd7b8f` for the product interface, then apply paired rollback migrations `010` and `009` only if the run-patch read projections must also be removed.

## 2026-07-20 13:32 NPT: Authenticated CoCo production review

- **Goal:** Complete the mandatory meaningful CoCo evidence with an independent Snowflake review of the production patch projections.
- **Files affected:** Sanitized CoCo artifact, usage log, build log, and submission checklist.
- **Commands:** Human browser authentication; `cortex` with the Snowflake SQL read-only guard, no MCP, bounded turns, and metadata/aggregate-only instructions.
- **Test evidence:** CoCo queried both secure views and confirmed zero duplicate projected verification rows, deterministic latest-result ordering, absence of content/evidence bodies from the run-patch list, and fixed-allowlist suitability.
- **Decision or issue:** The authenticated patch-detail endpoint necessarily transports review content. CoCo's warning was accepted and checked against existing session protection, no-cache behavior, and content-free structured logs. Its future multi-tenant row-level-security observation remains outside the single-operator P0 boundary.
- **Related commits:** `9aeb3fb`, `623beb4`, `8dd7b8f`
- **Rollback point:** Documentation-only evidence; removing it does not alter Snowflake or runtime state.

## 2026-07-20 13:48 NPT: Cloudflare production release

- **Goal:** Publish the finished static product and narrow Hono API at the owner-provided production origin with encrypted bindings, managed TLS, and live browser acceptance.
- **Files affected:** `apps/edge-api/wrangler.jsonc`, `apps/web/public/_headers`, `scripts/prepare_cloudflare_secrets.mjs`, README delivery state, and release evidence ledgers.
- **Commands:** Read-only DNS and Worker inspection; production secret-bundle generation and name-only validation; `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`; `wrangler deploy --secrets-file`; public header probes; live Playwright Chromium and axe acceptance.
- **Test evidence:** Cloudflare deployed Worker version `97a39b32-790a-48bf-8e5a-50d8ad1c63df` to `ripple.grimnej.com` with 114 static files and nine encrypted bindings. TLS, CSP, HSTS, clickjacking, MIME, referrer, permissions, API no-store, and immutable fingerprinted-asset cache headers are present. The live API authenticated successfully and returned the current Snowflake state of three material changes, six confirmed impacts, zero pending decisions, and two verified repairs. All four public Chromium scenarios passed: desktop and mobile visual baselines, serious/critical axe scans, all five authenticated surfaces with zero browser errors, and mobile keyboard navigation.
- **Decision or issue:** Direct static assets do not pass through Worker middleware, so a Cloudflare `_headers` manifest now mirrors the runtime security policy. The zone injects Cloudflare Web Analytics; CSP permits only its exact script and beacon origins. A stale local `workerd` process briefly locked the static export directory and was terminated before the clean rebuild. No paid Cloudflare resource was created.
- **Related commit:** `83e9411`
- **Rollback point:** Revert `83e9411` and redeploy only if intentionally withdrawing the custom domain and production bindings. Cloudflare retains prior Worker versions for an emergency runtime rollback, but the two earlier versions lack the final static security policy and are not release candidates.

## 2026-07-20 14:27 NPT: Readability and live run contract correction

- **Goal:** Double the supporting-text scale without enlarging display headings, preserve responsive information density, and restore the Impact and Verification surfaces for live runs containing fractional severity scores.
- **Files affected:** Web typography and responsive layout CSS, the browser response contract and regression test, desktop/mobile landing baselines, and the cost/build ledgers.
- **Commands:** Explicit font-size inventory; desktop and mobile Playwright rendering across the landing page and all five product surfaces; computed text-size and horizontal-overflow audits; axe and browser-console checks; `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`; `wrangler deploy --secrets-file`; two live production Playwright acceptance passes.
- **Test evidence:** Ninety-four explicit small-text declarations were consolidated into 17 to 34 px supporting-text tokens, each at least twice its former value, while display headings remained unchanged. All six surfaces at desktop and mobile widths contain no visible leaf text below 15 px, no page-level horizontal overflow, no browser errors, and no serious or critical axe findings. Eight web tests and 23 edge tests pass. The four-scenario production browser suite passed twice, including the latest run on both Impact and Verification.
- **Decision or issue:** The earlier 1 to 1.5 px adjustment was insufficient for the owner's reading needs. The shared finding contract also required an integer severity score even though Snowflake correctly returns computed fractional scores such as 2.925; accepting finite nonnegative numeric values removed the invalid-response failure without weakening count fields.
- **Related commit:** `2c105fc`
- **Rollback point:** Revert `2c105fc` and redeploy only if intentionally restoring the former scale and integer-only contract. That rollback would reintroduce both the readability defect and the fractional-severity response failure.

## 2026-07-20 18:45 NPT: Live multi-repository source monitoring

- **Goal:** Replace the prepared-scenario entry point with browser-configured public GitHub monitors, immediate and scheduled checks, exact commit provenance, multi-instance state, and a clearer typography hierarchy.
- **Files affected:** GitHub adapter and monitor orchestration in the Hono Worker, Cron and email bindings, monitor UI and contracts, migration `011`, Snowpark ingestion, production browser tests, and product/evidence documentation.
- **Commands:** Full JavaScript, Python, and SQL zero-warning gates; migration hash verification; Gitleaks history/staged scans; Snowflake stage upload and transactional migration; Wrangler deployment; production API and Playwright Chromium runs; one isolated public GitHub branch change; atomic patch apply and deterministic verification.
- **Test evidence:** 27 edge tests, eight web tests, and 32 Python tests pass. Migration `011` compiled and its receipt is recorded. Production Worker `899411b7-5a6a-4bdc-8ca8-3767ada14a50` serves the new UI/API with a 15-minute Cron trigger. The clean main monitor returned `NO_CHANGE`; the isolated validation branch produced three change atoms, twelve bounded findings, eight confirmed impacts, three patches, exact commit provenance, and one `VERIFIED` repair. Five live surfaces, the manual-check gesture, mobile keyboard navigation, visual baselines, and axe passed.
- **Decision or issue:** The first live connection exposed trimming before SHA-256 recomputation; exact GitHub text is now preserved and regression-tested. CoCo's repository review attempt again hit its browser callback timeout, so no new conclusion was claimed. Cloudflare accepted the email binding, but sender enrollment and a live delivery receipt still require a dashboard-authorized email setup.
- **Related implementation commit:** `6172158`
- **Rollback point:** Redeploy the prior Worker version and apply `snowflake/migrations/rollback/011_live_source_monitors.sql` only after accepting loss of monitor/check state. The main demo repository remains independently reversible through Git history.
