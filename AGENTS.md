# Ripple implementation rules

This file is binding for every human or coding agent working in this repository. Read `RIPPLE_IMPLEMENTATION_BLUEPRINT_CORRECTED.md` in full before making architectural or product decisions. The blueprint wins over convenience; official competition rules and verified platform constraints win over the blueprint if they conflict.

## Product boundary

Ripple's P0 promise is: change one authoritative fact, identify every evidence-backed downstream impact, let a human approve one repair, create a new immutable asset version atomically, and prove the repair with deterministic checks.

P0 supports only UTF-8 Markdown/plain text fixtures and exactly three change families: version requirements, endpoint replacements/deprecations, and numeric limits. Do not promote P1 or P2 work without owner approval.

## Fixed architecture

- Statically exported Next.js 16.2 frontend served as Cloudflare Worker static assets.
- A small Hono Cloudflare Worker is the only runtime API.
- The Worker calls a fixed Snowflake stored-procedure/read-view allowlist through the SQL API using key-pair JWT authentication.
- Snowflake standard tables, an internal stage, Snowpark Python 3.11 procedures, one Stream/task graph, bounded `AI_COMPLETE`, deterministic verification, and an application-append-only tamper-evident audit chain form the backend.
- Domain state is persisted in Snowflake. Do not add an external queue, Durable Objects, Redis, Celery, SSR, Server Actions, Next.js middleware, arbitrary crawling, or External Access Integration.

## Stop gates

Stop and obtain explicit owner approval before:

1. Provisioning Snowflake users, roles, warehouses, databases, schemas, stages, tasks, budgets, or keys.
2. Creating or rotating the Snowflake application key pair.
3. Creating Cloudflare secrets or a public deployment.
4. Selecting the final visual direction after design research.
5. Enabling cross-region inference.
6. Adding any third-party dependency after the initial stack lock.
7. Promoting P1/P2 work into P0.
8. Freezing submission artifacts.

Present exact commands and expected effects before each infrastructure gate. Never add a payment method or paid dependency/service.

## Engineering rules

- Treat source and asset content as untrusted text. Never render raw HTML or use `dangerouslySetInnerHTML`.
- Validate every external boundary with Zod or an explicit Snowpark/SQL schema.
- Do not accept SQL, object names, or procedure names from the browser.
- Use compare-and-set transitions and idempotency keys. Snowflake standard-table UNIQUE/PK/FK constraints are not a concurrency mechanism.
- Validate evidence ownership, offsets, substring, and SHA-256 server-side. Invalid evidence becomes uncertain and cannot produce a patch.
- Deterministic checks alone control `VERIFIED`; AI is advisory.
- Applying a patch must create and activate one new append-only asset version in the same transaction.
- Preserve the admission limits in the blueprint: 3 atoms/event, 5 candidates/atom, 12 candidates/event, 1 AI retry, 6 patches/event, and 2 AI credits/day in development.
- Never log secrets, tokens, raw source content, or full prompts containing source content.
- Do not commit `TODO`, `FIXME`, placeholder handlers, lorem ipsum, dead buttons, unimplemented routes, hard-coded demo answers, or fake integrations.
- Preserve unrelated user changes. Use small Conventional Commit-style commits that are independently revertible.

## Required validation

Affected work is not done until its relevant zero-warning gates pass. The target commands are:

```text
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
uv run ruff check .
uv run ruff format --check .
uv run mypy snowflake scripts
uv run pytest
sqlfluff lint snowflake/
```

Run Snowflake integration, Worker/API, Playwright Chromium, axe, visual-regression, concurrency, and chaos checks when the affected layer exists. Never report a gate as passing before it has actually run.

## Documentation and CoCo

- Update `docs/BUILD_LOG.md` for each meaningful slice with goal, files, commands, evidence, decision/issue, related commit, and rollback point.
- Update the cost, dependency, data-licence, security, and limitation ledgers when their facts change.
- CoCo is invoked as `cortex`. It must do meaningful Snowflake-specific work, not ceremonial screenshot generation.
- For every meaningful CoCo session, save only a sanitized transcript/screenshot, record what was accepted/edited/rejected in `docs/COCO_USAGE_LOG.md`, link the resulting artifact and commit, and never publish account identifiers, session IDs, or secrets.

## Visual quality

Do not code the final visual system before the research-and-owner-selection gate. Research 8–10 current references, produce two clearly distinct directions and four focused mocks, then stop for selection. Honor the blueprint's anti-slop bans, accessibility requirements, five-surface limit, responsive targets, reduced-motion behavior, and graph/list information parity.
