# Submission checklist

## Eligibility and artifacts

- [ ] Working prototype and complete accessible source repository.
- [ ] Reproducible bootstrap, seed, verify, teardown, and rollback documentation.
- [ ] English deck and five-minute demo.
- [ ] Dataset, fixture, source, font, and third-party licence disclosures.
- [ ] Meaningful Snowflake, CoCo, Cortex AI, and Python implementation evidence.

## Product proof

- [x] One disclosed source pair produces three validated material changes.
- [x] Six impacted assets, one uncertain candidate, and one known non-dependency are represented honestly.
- [x] One reviewed patch creates exactly one active new asset version.
- [x] Deterministic verification passes and malformed/fabricated AI evidence fails safely.
- [x] Twenty concurrent applies produce one winner and idempotent retries replay the original result.
- [ ] Browser/Worker interruption cannot duplicate the Snowflake mutation.

## Quality and operations

- [ ] Static analysis, unit, property, Snowflake integration, API, Chromium E2E, keyboard, axe, visual regression, and chaos gates pass.
- [ ] Worker bundle is under 2.5 MB compressed and measured p95 CPU is under 8 ms.
- [ ] Daily AI admission limits are active and at least 70% of remaining balance is reserved for the demo.
- [ ] Fresh eligible-account reproduction succeeds.
- [ ] No unresolved P0 defect, secret, dead action, fake response, or unsupported claim remains.

## Freeze

- [ ] Owner approves submission freeze.
- [ ] `submission-v1` tag and commit SHA recorded.
- [ ] Migration, fixture, benchmark-label, frontend, and deployed Worker identifiers/hashes recorded in `docs/SUBMISSION_MANIFEST.md`.
- [ ] Exact deployed artifacts preserved and automatic deployment from `main` disabled.
