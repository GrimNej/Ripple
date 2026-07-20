# Official session requirements

**Source reviewed:** Full transcript of the official Introductory and Problem Statement Explainer Session

**Reviewed:** 2026-07-20

This document converts the organizer guidance into implementation and release checks. It supplements the published terms and participant dashboard. If the participant dashboard or published terms differ, those sources control.

## Track fit

Ripple targets the Intelligent Workflow Automation Agent track. The organizers defined this track by its movement from data to insight to action. A strong entry detects an issue, reasons across context, and executes a useful next step. A dashboard, alert, chatbot, or one-shot prompt is not sufficient.

Ripple meets that intent through this governed workflow:

1. A prepared authoritative source pair enters the Snowflake pipeline.
2. Deterministic diffing and bounded AI identify material factual changes.
3. Ripple finds evidence-backed downstream impacts.
4. A human reviews and edits a repair.
5. Approval atomically creates and activates one immutable asset version.
6. Deterministic checks verify the result and the audit chain records it.

The product does not stop at showing an insight. It performs a controlled repair action with human authorization and machine-verifiable proof.

## Organizer criteria and Ripple evidence

| Organizer guidance                                     | Ripple requirement                                                                                                  | Release evidence                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Solve an actual enterprise or real-world problem       | Show the cost and risk of stale operational knowledge across documentation, support, and workflows                  | Landing page, product narrative, five-minute presentation                |
| Use multi-step reasoning and context-aware actions     | Preserve the Snowflake stage graph, evidence validation, retrieval, impact decision, patch, and verification stages | Task history, run detail, impact view, patch review                      |
| Execute an action, not only an insight                 | Apply an approved patch as a new active asset version                                                               | Live apply flow and deterministic verification result                    |
| Avoid hard-coded or assumed functionality              | Every authenticated product state must come from the Hono API and Snowflake secure views or procedures              | API tests, browser network evidence, Snowflake integration checks        |
| Make Snowflake central to the solution                 | Keep domain state, orchestration, bounded AI, versioning, verification, and audit history in Snowflake              | Architecture, migration manifest, task graph, procedure inventory        |
| Use CoCo meaningfully                                  | Tie CoCo sessions to Snowflake-specific artifacts, validation, and commits                                          | `docs/COCO_USAGE_LOG.md` and sanitized evidence                          |
| Deliver a complete, usable product                     | Provide an end-to-end experience that a non-specialist can operate without SQL or terminal access                   | Landing, authentication, five product surfaces, responsive browser flows |
| Maintain code quality                                  | Pass zero-warning lint, type, formatting, Python, and SQL gates                                                     | Build log and CI command output                                          |
| Maintain security                                      | Enforce session, CSRF, origin, bounded bodies, fixed SQL allowlists, least privilege, and secret scanning           | API security suite, role denial probes, Gitleaks                         |
| Maintain efficiency                                    | Meet Worker CPU and bundle limits and frontend performance budgets                                                  | CPU profile, Wrangler bundle report, browser performance report          |
| Maintain testability                                   | Cover deterministic core, API boundaries, browser flow, concurrency, and chaos behavior                             | TypeScript, Python, Snowflake, and Playwright results                    |
| Maintain accessibility                                 | Provide keyboard operation, visible focus, reduced motion, graph/list parity, and automated axe coverage            | Accessibility checks across all primary surfaces                         |
| Prefer feature richness only when quality remains high | Keep P0 narrow and reject scope that weakens the verified action path                                               | Blueprint scope and known-limitations ledger                             |

## Submission artifacts confirmed by the session

The participant dashboard provides the final format. The organizer session explicitly identified these separate artifacts:

- Accessible GitHub repository with live code updates.
- Live deployment link.
- Video link.
- Presentation.
- Selected problem statement.
- Explanation of the solution and the services used.

Before freeze, the owner must inspect the participant dashboard for current field names, templates, duration limits, visibility rules, and upload requirements. Those details were referenced but not stated in the session transcript.

## Acceptance status

- [x] The browser completes the real source-change to verified-repair flow.
- [ ] The presentation makes the executed action unmistakable in its first half.
- [x] The technical proof surface visibly attributes orchestration and governance to Snowflake.
- [x] The repository contains no fake integration, hidden hard-coded outcome, placeholder route, or nonfunctional control.
- [x] Static analysis, security, efficiency, testability, and accessibility evidence is current before deployment.
- [ ] The video and deck show the same deployed commit recorded in the submission manifest.
