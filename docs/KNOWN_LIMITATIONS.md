# Known limitations

- Live monitoring supports public GitHub repositories only. It reads operator-selected Markdown/plain-text paths and does not crawl arbitrary URLs, issues, pull requests, or repository trees.
- One monitor accepts one authoritative file, one branch, and one to eight downstream knowledge files. Source files are capped at 1 MiB, each asset at 256 KiB, and one capture at 2 MiB.
- Automatic monitor intervals are currently 12 or 24 hours. The Cloudflare scheduler wakes every 15 minutes to admit due monitors; **Check now** is available for immediate runs.
- Approved repairs create and activate governed Snowflake asset versions. Ripple does not write commits or pull requests back to GitHub in the current scope.
- Email alerts are live from `ripple@notify.grimnej.com`, and a real recipient receipt has been confirmed. The Workers Free plan permits delivery only to Cloudflare-verified destination addresses; arbitrary recipient addresses require a paid plan and remain intentionally disabled. Routing records exist only on `notify.grimnej.com`, leaving the existing Zoho MX records at the apex untouched.
- The supported factual changes are version requirements, endpoint replacements/deprecations, and numeric limits. Other edits remain visible at snapshot level but cannot produce a confirmed patch.
- Standard Snowflake table uniqueness and foreign-key declarations are not treated as concurrency enforcement.
- Audit history is application-append-only and tamper-evident within the application trust boundary. Snowflake administrative roles remain privileged.
- The app has one operator and a stateless 30-minute signed session. Logout clears the browser cookie but cannot centrally revoke an already issued session; rotating the signing secret is the emergency invalidation path.
- The app does not claim durable global login throttling. Uniform failures, signed sessions, exact Origin checks, and CSRF validation remain the current boundary.
- Mobile supports the complete five-surface workflow and uses a list-first impact view while retaining graph/list information parity.
- The table-level `end_offset >= start_offset` relationship is enforced by trusted procedures and property/integration tests because the account rejected Snowflake's inline multi-column check form.
- The first legacy audit event predates the CAS audit head and stores Python `None` as a literal genesis marker in `previous_event_hash`; its event hash correctly uses `GENESIS`. Verification normalizes only that sequence-one representation, and the append-only row is not rewritten.
