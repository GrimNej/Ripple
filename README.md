# Ripple

> Change one fact. Ripple shows everything it breaks—and proves the approved repair fixed it.

Ripple is a Snowflake CoCo CLI Hackathon 2026 project for evidence-backed downstream-change detection and controlled knowledge repair. It compares disclosed versions of an authoritative source, validates factual change evidence, finds affected knowledge/workflow assets, requires a human decision, creates a new append-only asset version, and verifies the correction deterministically.

## Current status

Phases 0 through 3 are complete. The repository/toolchain contract, nine-probe capability preflight, deterministic Snowflake foundation, disclosed golden fixture, one authoritative Stream/task graph, bounded structured AI, evidence validation, retry handling, and review-patch generation all pass their local and live gates. Phase 4 atomic patch application and deterministic verification are next; the edge API, final visual system, deployment, and submission artifacts remain intentionally incomplete.

The complete binding specification is `RIPPLE_IMPLEMENTATION_BLUEPRINT_CORRECTED.md`. Contributor rules are in `AGENTS.md`.

## P0 architecture

```text
Static Next.js frontend on Cloudflare Worker assets
        ↓ HTTPS / JSON
Small Hono Worker API
        ↓ fixed Snowflake SQL API boundary
Snowflake procedures, tables, stage, task graph, and bounded AI_COMPLETE
        ↓
Deterministic verification and tamper-evident application audit history
```

The project intentionally excludes live crawling, External Access Integration, SSR/OpenNext, custom worker queues, auto-publishing, arbitrary semantic edits, and multi-user identity from P0.

## Build order

1. Repository and evidence ledgers.
2. Owner-approved capability preflight.
3. Deterministic Snowflake foundation.
4. Task graph and bounded structured AI.
5. Atomic patch transaction and verification.
6. Narrow authenticated edge API.
7. Two visual directions and owner selection.
8. Five production-quality frontend surfaces.
9. Benchmark, hardening, clean-account reproduction, and submission freeze.

Provisioning, preflight, seed, rollback, and teardown scripts are versioned under `scripts/` and `snowflake/`. Do not run destructive rollback or teardown paths without following `docs/ROLLBACK_RUNBOOK.md`.
