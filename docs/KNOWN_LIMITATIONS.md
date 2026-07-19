# Known limitations

- The mandatory platform preflight, Snowflake product backend, atomic patch/verification flow, and authenticated product API pass, but the final visual system and public deployment are not complete yet.
- P0 uses disclosed prepared Markdown/plain-text snapshots and does not crawl arbitrary URLs.
- Trial-account external network access is treated as unavailable until verified otherwise and is not part of the critical architecture.
- P0 handles only version requirements, endpoint replacements/deprecations, and numeric limits.
- Standard Snowflake table uniqueness/foreign-key declarations are not treated as concurrency enforcement.
- Audit history is application-append-only and tamper-evident only within the application trust boundary; Snowflake administrative roles remain privileged.
- The app has one operator and a stateless 30-minute signed session. Logout clears the browser cookie but cannot centrally revoke an already issued session; rotating the signing secret is the emergency invalidation path.
- P0 does not claim durable global login throttling; the private deployment URL, uniform authentication failures, and client backoff are the available controls until a verified free global Cloudflare rate-limiting facility is selected.
- Mobile is a basic read/review experience and uses a list-first impact view.
- Prepared read-only output may be shown during a service outage only when clearly labeled as a previously completed real run.
- The table-level `end_offset >= start_offset` relationship is enforced by trusted procedures and property/integration tests because the deployed account rejected Snowflake's inline multi-column check form; both offset columns retain non-negative/bounded procedural validation.
- The first legacy audit event predates the CAS audit head and stores Python `None` as a literal genesis marker in `previous_event_hash`; its event hash correctly uses `GENESIS`. Verification normalizes only that sequence-one representation, and the append-only row is not rewritten.
