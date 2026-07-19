# Known limitations

- The mandatory platform preflight passed, but production domain migrations, fixtures, pipeline procedures, and product interfaces are not complete yet.
- P0 uses disclosed prepared Markdown/plain-text snapshots and does not crawl arbitrary URLs.
- Trial-account external network access is treated as unavailable until verified otherwise and is not part of the critical architecture.
- P0 handles only version requirements, endpoint replacements/deprecations, and numeric limits.
- Standard Snowflake table uniqueness/foreign-key declarations are not treated as concurrency enforcement.
- Audit history is application-append-only and tamper-evident only within the application trust boundary; Snowflake administrative roles remain privileged.
- The app has one operator and a stateless 30-minute signed session. Logout clears the browser cookie but cannot centrally revoke an already issued session; rotating the signing secret is the emergency invalidation path.
- Mobile is a basic read/review experience and uses a list-first impact view.
- Prepared read-only output may be shown during a service outage only when clearly labeled as a previously completed real run.
