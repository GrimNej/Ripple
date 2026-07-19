# Visual direction research

**Status:** Four focused mocks complete; awaiting explicit owner selection before production UI implementation.

**Research date:** 2026-07-19

## Live reference study

No page, proprietary component, illustration, icon, font file, or brand asset below will be copied. The purpose of the study is to extract interaction and information-design principles suited to Ripple's own data and trust model.

| Reference                                                                                                                                                                               | Category                                | Principle carried forward                                                                                                                                             | What must not be copied                                                                                    | Accessibility observation                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Our World in Data — Data Explorers](https://ourworldindata.org/explorers)                                                                                                              | Editorial data product                  | Let a small chart or map preview establish the subject before the user opens a deeper explorer; titles and prose explain why each view exists.                        | The publication's navy/red identity, card catalogue, and chart styling.                                    | Strong heading hierarchy and visible text labels work well; Ripple must additionally provide a text/table equivalent for every graph relationship.                                      |
| [Reuters Graphics](https://www.reuters.com/graphics/)                                                                                                                                   | Premium visual journalism               | Lead with the finding, date, and explanatory sentence; the visualization supports a reported claim instead of becoming ambient decoration.                            | Reuters typography, orange identity, story templates, data, graphics, or imagery.                          | A skip-to-content link and descriptive article/figure labeling were present; advertising and consent overlays demonstrated why Ripple should keep operational screens distraction-free. |
| [GitHub pull-request review](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/reviewing-proposed-changes-in-a-pull-request) | Version-control diff                    | Review one bounded unit at a time, keep progress visible, tie comments/actions to an exact changed span, and make the final decision consequence explicit.            | GitHub chrome, Octicons, code-centric metaphors, or green/red as the only meaning carrier.                 | Unified/split modes and file progress reduce cognitive load; Ripple must retain text labels, keyboard traversal, and non-color `+`/`−` markers.                                         |
| [GitHub Primer DataTable](https://primer.style/product/components/data-table/)                                                                                                          | Developer infrastructure pattern        | Use row headers, deliberate column sizing, compact density options, stable skeletons, and pagination only when the data volume warrants it.                           | Primer tokens, GitHub component styling, or default table visuals.                                         | The reference explicitly uses accessible names, row headers, and labeled pagination; Ripple will preserve those semantics in its own visual language.                                   |
| [Sentry Issue Details](https://docs.sentry.io/product/issues/issue-details/)                                                                                                            | Observability / triage                  | Keep the high-level state and actions fixed above a dense evidence workspace; filters, event distribution, primary detail, and activity metadata form distinct bands. | Sentry purple, its full three-column density, AI actions, or its issue hierarchy.                          | The visual anatomy has persistent text labels beside controls; Ripple should reduce density, preserve logical heading order, and avoid tiny unlabeled icons.                            |
| [Grafana IRM incident timeline](https://grafana.com/docs/grafana-cloud/alerting-and-irm/irm/manage-incidents/incident-timeline/)                                                        | Incident operations                     | Treat the timeline as a permanent, chronological source of truth and distinguish observations, decisions, and state transitions.                                      | Grafana orange/blue, dashboard chrome, sprawling global navigation, or emoji-dependent semantics.          | Chronology is explained in text and headings; Ripple's task/audit timelines must expose timestamps, event types, and status words to assistive technology.                              |
| [Marquez](https://marquezproject.ai/)                                                                                                                                                   | Knowledge lineage                       | Center the selected node, maintain directionality, provide a compact overview, and place node metadata adjacent to the graph rather than inside every edge.           | The dark teal brand, node/card design, whole-screen graph, or unlimited lineage depth.                     | The graph is visually legible but not sufficient alone; Ripple's synchronized evidence list is mandatory and must contain the same edge facts and actions.                              |
| [Linear conceptual model](https://linear.app/docs/conceptual-model)                                                                                                                     | Developer operations                    | Quiet chrome and consistent row rhythm allow dense stateful work to scan quickly; the conceptual hierarchy stays shallow and predictable.                             | Linear's dark palette, gradient-framed screenshots, ultra-muted contrast, or icon-only interactions.       | Clear labels and recurring navigation structure help orientation; Ripple must use stronger secondary-text contrast and 44 px minimum targets.                                           |
| [Wellcome Collection](https://wellcomecollection.org/collections)                                                                                                                       | Museum / publication information design | Use assertive typography, large search/selection controls, and section rhythm instead of placing every concept inside a rounded card.                                 | Wellcome's logo, mustard/blue palette, irregular hero silhouette, imagery, or collection taxonomy.         | Prominent labels and large targets are strong; consent UI showed a visible focus treatment. Ripple will keep the same target generosity without marketing overlays.                     |
| [Vercel Geist](https://vercel.com/geist/introduction)                                                                                                                                   | Precision developer system              | A strict grid, fine rules, numeric rhythm, and restrained elevation can create hierarchy without shadows or decorative containers.                                    | Vercel's black/white brand, Geist typeface/assets, dashboard tiles, triangle motifs, or component styling. | The reference calls out high-contrast color; Ripple must keep icons accompanied by text and validate all semantic colors in context.                                                    |

MoMA's collection was considered but the live browser inspection reached an anti-bot challenge, so it is deliberately not counted as one of the ten reviewed references.

## Direction A — Editorial Systems Cartography

**Thesis:** Ripple is an evidence publication with operator controls. The interface should make causal relationships feel mapped, cited, and deliberately annotated.

- Warm mineral paper and clean off-white working sheets; neither sepia nor beige nostalgia.
- Georgia/system serif for claims and section titles; Arial/system sans and Courier for controls, evidence coordinates, IDs, and hashes.
- Fine dark rules, almost no rounded containers, and only one restrained oxide-red signal.
- Graph edges read as routes on a technical map. Dashed ochre plus a `?` marker identifies uncertainty without relying on color.
- Evidence is allowed into the margin as editorial annotation, keeping provenance close to the decision.
- More breathing room and stronger narrative hierarchy; best fit for explaining trust and causality to judges or first-time operators.

Token hypothesis:

| Role                     | Value                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| Canvas / sheet           | `#F1EEE6` / `#FBFAF6`                                                                                     |
| Primary / secondary text | `#1A211E` / `#69716D`                                                                                     |
| Rules                    | `#BBB9B0`, with primary rules in `#1A211E`                                                                |
| Signal                   | oxide `#BD452F`                                                                                           |
| Evidence highlight       | straw `#EADF9C`                                                                                           |
| Confirmed / uncertain    | forest `#27745B` / ochre `#D49B20`, always paired with labels/patterns                                    |
| Radius / depth           | `0` for structural regions; pills only for compact status; one 5 px hard shadow on the prepared-run sheet |
| Motion                   | 120–180 ms direct state transitions; no parallax, ambient motion, or graph drift                          |

Mocks:

- [Command Center](../design/visual-lock/atlas-command.png)
- [Patch Review](../design/visual-lock/atlas-patch.png)

## Direction B — Precision Instrument Panel

**Thesis:** Ripple is a calibrated operational instrument. The interface should optimize for state recognition, repeat use, and exact numerical scanning.

- Carbon-black foundation with low-depth charcoal surfaces and hairline rules.
- Arial/system sans for plain-language entities; Courier/system monospace for state, timing, identifiers, and measured proof.
- One chartreuse action signal. Cyan indicates confirmed/healthy state; amber and coral remain reserved for uncertainty and failure.
- State bands, stage tracks, row registers, and numeric banks replace dashboard cards.
- Patch review behaves like a controlled transaction console with delta, editable plain text, evidence packet, and atomic effects visible at once.
- Highest density and fastest scanning; best fit for experienced technical operators.

Token hypothesis:

| Role                           | Value                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Canvas / surfaces              | `#0B0F0E` / `#111715` / `#151D1A`                                                                         |
| Primary / secondary text       | `#EDF2EC` / `#8D9A94`                                                                                     |
| Rules                          | `#2E3934`                                                                                                 |
| Action signal                  | chartreuse `#D7FF54`                                                                                      |
| Confirmed / uncertain / failed | cyan `#63D5BB` / amber `#F0BD55` / coral `#EF705E`, always paired with text and geometry                  |
| Radius / depth                 | `0`; no shadows; hierarchy comes from ruled planes and contrast                                           |
| Motion                         | 90–140 ms state changes; stage progress may draw once, then remain still; reduced motion removes the draw |

Mocks:

- [Command Center](../design/visual-lock/console-command.png)
- [Patch Review](../design/visual-lock/console-patch.png)

## Recommendation and decision boundary

**Recommendation: Direction A — Editorial Systems Cartography.** It is more ownable, makes Ripple's evidence and causality promise immediately understandable, and is less likely to collapse into a familiar monitoring console. Direction B is credible and efficient, but its dark high-density language is closer to existing developer tools and therefore less differentiated.

Do not blend the directions after selection. Shared functional requirements—stable skeletons, 44 px targets, literal status text, full keyboard operation, reduced motion, evidence-list parity, and responsive list-first behavior—are product requirements rather than visual motifs.

Production UI work remains paused until the owner explicitly selects Direction A or Direction B.
