# Five-minute demo script

## Before recording

1. Open [`GrimNej/ripple-source-lab`](https://github.com/GrimNej/ripple-source-lab) on `main`.
2. Open [Ripple](https://ripple.grimnej.com), enter the operator code, and confirm the **Runtime policy** monitor shows the same repository and `main` branch.
3. Keep `authoritative/runtime-policy.md` and Ripple in separate tabs.

## Recording flow

| Time      | Action                                                                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00-0:30 | Explain the problem: one source fact changes while installation guides, support responses, and runbooks quietly become stale.                                                                    |
| 0:30-1:05 | In Ripple, show that the repository, authoritative file, three downstream files, schedule, commit, and **Check now** action were configured entirely in the browser.                             |
| 1:05-1:35 | On GitHub, edit `authoritative/runtime-policy.md`: change Python `3.10` to `3.12`, `POST /v1/jobs` to `POST /v2/jobs`, and `10,000` to `25,000` API requests per day. Commit directly to `main`. |
| 1:35-2:05 | Return to Ripple and press **Check now**. Show the detected commit and explain that the same check also runs automatically every 12 hours.                                                       |
| 2:05-2:50 | Open **Change Event**, then **Impact View**. Show the three supported change families and one exact source-to-asset evidence edge in both graph and accessible list form.                        |
| 2:50-3:45 | Open **Patch Review**. Compare current and proposed knowledge, optionally edit the repair, explain the consequence, and approve one patch.                                                       |
| 3:45-4:20 | Open **Verification**. Show the new immutable asset version, SHA-256, deterministic checks, and audit proof. Emphasize that AI advises, but deterministic checks alone control `VERIFIED`.       |
| 4:20-5:00 | Close with Snowflake orchestration, bounded cost, multi-repository support, automatic monitoring, and the fact that uncertainty remains visible for human review.                                |

## What each page proves

- **Command Center:** real source connection, multiple monitor instances, manual check, schedule, commit, and decision queue.
- **Change Event:** exact old/new claims, pipeline progress, and GitHub commit provenance.
- **Impact View:** every bounded downstream relationship with graph/list parity and evidence.
- **Patch Review:** human control over an editable, evidence-backed repair.
- **Verification:** immutable version creation, content hash, deterministic checks, and audit-chain result.

Keep claims narrow: Ripple monitors exact public GitHub paths, supports version requirements, endpoint replacements, and numeric limits, and applies repairs to its governed knowledge assets after human approval.
