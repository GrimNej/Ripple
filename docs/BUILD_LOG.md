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
