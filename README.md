# Ripple

> Change one fact. Ripple shows everything it breaks—and proves the approved repair fixed it.

Ripple is a Snowflake CoCo CLI Hackathon 2026 project for evidence-backed downstream-change detection and controlled knowledge repair. It compares disclosed versions of an authoritative source, validates factual change evidence, finds affected knowledge/workflow assets, requires a human decision, creates a new append-only asset version, and verifies the correction deterministically.

## Current status

Phase 0 repository bootstrap is in progress. No Snowflake or Cloudflare resources have been created, no application key has been generated, no third-party runtime dependency has been installed, and no product capability is being claimed yet.

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

Setup commands will be published only after the capability preflight fixes the exact supported stack and fallback decisions. This avoids presenting unverified infrastructure steps as reproducible instructions.
