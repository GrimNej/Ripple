# Rollback and recovery runbook

## Migrations

Every forward Snowflake migration must have a paired rollback file and immutable manifest entry containing order, filename, SHA-256, applied timestamp, and applied commit. Never edit an applied migration; add a new one.

## Data

Asset versions are append-only. A product rollback creates an explicit new rollback version and advances the current pointer; it never deletes or rewrites prior versions. Snowflake Time Travel is an operational aid, not the domain versioning model.

## Cloudflare

Record every deployed Worker version and static artifact hash. Roll back to a known deployed version; do not rebuild from an unpinned workspace during the demo.

## Degraded demo

If live services fail, show only the latest completed real run with its run ID, hashes, task history, asset-version ID, and audit evidence. Label the live service unavailable and never present cached output as a live run.

## Preflight recovery

The current preflight footprint is external state. With no production fixture data present, suspend the child/root tasks, drop the two service users, drop the `RIPPLE` database, drop the warehouse and its resource monitor, then drop the app/admin roles. Remove the two ignored local RSA key pairs only after their Snowflake users are gone. Do not use the Phase 0 assumption that no cloud objects exist.
