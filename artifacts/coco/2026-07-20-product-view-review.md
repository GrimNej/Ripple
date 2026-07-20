# CoCo product-view review

Date: 2026-07-20

Scope: Read-only Snowflake review of the run-patch and patch-detail secure views. The session allowed aggregate and metadata SQL only and prohibited content, account data, user data, query metadata, session metadata, and secrets.

## Accepted findings

- The patch-detail view uses a window-ranked verification projection with deterministic tie-breaking and returned no patch with more than one projected verification row.
- The run-patch view exposes identifiers, state, timestamps, claim-level metadata, and asset metadata without proposed content, asset bodies, evidence payloads, or raw files.
- Both objects are secure views without dynamic SQL and are suitable for the Worker's fixed read allowlist.
- The patch-detail view necessarily returns proposed, original, and current asset content to the authenticated review surface. That response must remain authenticated, uncached at the edge, and absent from logs.
- Tenant row-level security is unnecessary inside Ripple's fixed single-operator P0 boundary. It would become mandatory before any multi-tenant expansion.

## Disposition

The first three findings were accepted as independent confirmation. The transport warning was checked against the Worker implementation and required no edit because requests are session-protected, responses are not edge-cached, and structured logs contain no content. The multi-tenant observation was recorded as out of P0 scope and was not promoted.

Persistent mutation from CoCo: none.
