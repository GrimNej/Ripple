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

The current project footprint includes disclosed P0 fixture data and applied migrations. For a migration-only reversal, apply paired rollback files in reverse manifest order only after recording/exporting evidence and confirming data loss is intended. For complete teardown, suspend every pipeline/preflight task, drop the two service users, drop the `RIPPLE` database, drop the warehouse and resource monitor, then drop read-only/app/pipeline/migrator/admin roles. Remove the two ignored local RSA key pairs only after their Snowflake users are gone. `scripts/teardown_snowflake.sql` is destructive and must be reviewed against this order before execution.
