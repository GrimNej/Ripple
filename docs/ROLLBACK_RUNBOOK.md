# Rollback and recovery runbook

## Migrations

Every forward Snowflake migration must have a paired rollback file and immutable manifest entry containing order, filename, SHA-256, applied timestamp, and applied commit. Never edit an applied migration; add a new one.

## Data

Asset versions are append-only. A product rollback creates an explicit new rollback version and advances the current pointer; it never deletes or rewrites prior versions. Snowflake Time Travel is an operational aid, not the domain versioning model.

## Cloudflare

Record every deployed Worker version and static artifact hash. Roll back to a known deployed version; do not rebuild from an unpinned workspace during the demo.

## Degraded demo

If live services fail, show only the latest completed real run with its run ID, hashes, task history, asset-version ID, and audit evidence. Label the live service unavailable and never present cached output as a live run.

## Phase 0 recovery

No cloud objects exist. Retaining only the owner-supplied blueprint fully restores the pre-bootstrap workspace.
