# Visual direction research

**Status:** Direction C, Cinematic Signal, selected by the product owner and implemented across the public landing page, authentication, five product surfaces, and all operational states.

**Research date:** 2026-07-19

## Product presentation requirement

Ripple must present as a complete, enduring product rather than an event artifact or small proof of concept.

- The production experience includes a first-class public landing page in addition to the five authenticated product surfaces.
- Landing, application, authentication, empty/loading/error states, and responsive layouts must share one visual system.
- Public-facing UI and marketing copy must not mention a demo, hackathon, prototype, golden scenario, judging, or submission context.
- Historical implementation context may remain in internal engineering documentation and metadata where required.
- Motion should create recognition and hierarchy, then yield to the work. It must not delay a decision or hide a state change.

## Round 1 disposition

Direction A, Editorial Systems Cartography, and Direction B, Precision Instrument Panel, were both explicitly rejected by the product owner on 2026-07-19. They are historical artifacts only. Do not reuse, blend, or gradually evolve their palettes, typography, layout language, or aesthetic thesis into production.

## Round 2 live template and product study

No template, page, proprietary asset, illustration, font file, or brand element below will be copied. The study extracts composition and motion principles for an original Ripple product system.

| Reference                                                                                              | Date viewed | Principle carried forward                                                                                                                                     | What must not be copied                                                                                                       | Accessibility observation                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Flames / Framer Marketplace](https://www.framer.com/community/marketplace/templates/flames/)          | 2026-07-19  | A single memorable hero device, staged product-window reveal, and compact floating evidence cards can create depth before the user scrolls.                   | Flames branding, glitch headline, halftone field, dark palette, isometric illustrations, page structure, or product mockups.  | The large headline and labeled CTA are strong; Ripple must avoid the reference's small secondary text and remove all looping effects under reduced motion.           |
| [Makro / Framer Marketplace](https://www.framer.com/community/marketplace/templates/makro/)            | 2026-07-19  | Oversized type, generous negative space, an art-directed image plane, and very selective chartreuse create immediate confidence without a card grid.          | The portrait, finance narrative, chartreuse/charcoal button treatment, hero selector, or floating finance cards.              | Clear reading order and large controls are useful; decorative image layers require non-essential alt handling and cannot carry product meaning.                      |
| [Echo Agent / Framer Marketplace](https://www.framer.com/community/marketplace/templates/echo-agent/)  | 2026-07-19  | Bold condensed display type, calm body type, marker reveals, solid accent blocks, and pattern fills can feel human and energetic without becoming childish.   | Its Barlow/Stack/Fragment type combination, multicolor token set, physics footer, CRM content, or highlight animation design. | The template documents responsive behavior; Ripple will keep minimum 44 px targets and ensure marker/color treatments never replace text labels.                     |
| [Planar / Framer Marketplace](https://www.framer.com/community/marketplace/templates/planar/)          | 2026-07-19  | One repeatable masking motif can give a whole product family visual continuity more effectively than unrelated decorative effects.                            | Planar's mask artwork, colorful gradients, layout modules, product photography, or light/dark compositions.                   | Masked artwork is decorative only; content and focus order must remain intact with imagery, masks, or animation disabled.                                            |
| [SaaS dashboard hover animation / Webflow](https://saas-hero-dashboard-animation-on-hover.webflow.io/) | 2026-07-19  | A product surface can settle into place on entry and respond subtly to the pointer, giving it physical presence without turning it into a fake terminal.      | The dashboard design, white fade mask, Kanban data, people imagery, exact perspective, or orange CTA pill.                    | Pointer tilt must have no functional meaning, work without hover, and become a still composition for reduced-motion and touch users.                                 |
| [Resend](https://resend.com/)                                                                          | 2026-07-19  | Cinematic restraint comes from deep black, controlled light, one sculptural object, and a deliberate serif/sans contrast rather than many effects.            | Resend's cube, wordmark, black-on-black lighting setup, navigation, copy, or serif treatment.                                 | Contrast is excellent for primary text; Ripple must raise secondary-label contrast inside dense product screens and never place required content inside a 3D object. |
| [Raycast](https://www.raycast.com/)                                                                    | 2026-07-19  | A brand can own one high-energy color and directional motion motif across marketing and product framing.                                                      | Raycast's red ribbons, logo, dark shell, exact hero composition, button styling, or download flow.                            | The centered hierarchy is simple and scannable; motion textures must remain behind content and pause under reduced-motion preferences.                               |
| [Railway](https://railway.com/)                                                                        | 2026-07-19  | A large atmospheric illustration can frame a credible product window while keeping the actual software visible and legible.                                   | Railway's night-sky artwork, purple identity, typography, interface screenshots, or deployment narrative.                     | The product window contains very small text at marketing scale; Ripple's application UI must use production-size text rather than screenshot-scale facsimiles.       |
| [Superlist](https://www.superlist.com/)                                                                | 2026-07-19  | Strong display type, a confident vermilion signal, a large product reveal, and animated depth can feel expressive while retaining a familiar product promise. | Superlist's logo, red gradient atmosphere, headline, app screenshot, dark plum palette, or sign-up composition.               | Primary controls are clear and prominent; background movement and media require pause/reduced-motion handling, and consent overlays must not obstruct core actions.  |
| [Spline](https://spline.design/)                                                                       | 2026-07-19  | Interactive depth is strongest when the scene invites exploration but the value proposition and CTA remain independent of the canvas.                         | Spline's 3D shapes, character, rainbow mark, black grid floor, blue CTA, interaction copy, or scene layout.                   | The 3D canvas needs keyboard-independent alternatives; Ripple's causal map always retains an equivalent synchronized evidence list.                                  |

The current Framer template pages, live product sites, and Webflow interaction were inspected in a real 1440 x 900 Chromium viewport. Marketplace claims were not treated as proof of accessibility or performance.

## Direction C — Cinematic Signal

**Thesis:** Ripple is the quiet intelligence underneath a living knowledge system. The interface should feel cinematic, exact, and consequential.

- Obsidian foundation with restrained smoke texture and one sculpted coral-to-amber signal.
- Manrope for product text, Instrument Serif for moments of consequence, and DM Mono for evidence coordinates.
- Concentric signal rings and moving causal paths become Ripple's signature motif; there are no generic glowing orbs or ambient mesh gradients.
- The landing page stages a real change pipeline inside one dimensional product window, supported by small source and verification objects.
- The application trades marketing scale for calibrated information density while preserving the same signal, type, and depth language.
- Motion: product window settles once, signal edges travel continuously at low contrast, evidence objects float by a few pixels, and interactions respond in 150–220 ms.
- Reduced motion: all entry, float, orbit, dash, and sheen animations resolve immediately to a stable final state.

Token hypothesis:

| Role                     | Value                                                                            |
| ------------------------ | -------------------------------------------------------------------------------- |
| Canvas / working surface | `#090B0C` / `#111416` / `#171A1D`                                                |
| Primary / secondary text | `#F5F2EA` / `#9B9B97`                                                            |
| Signal                   | coral `#FF735C`, amber `#FFC36E`                                                 |
| Verified                 | mint `#A8FFD8`, always paired with text and a check                              |
| Typography               | Manrope, Instrument Serif, DM Mono; all openly licensed Google fonts             |
| Radius / depth           | 10–24 px; one primary depth plane, not glass cards everywhere                    |
| Motion                   | 150–220 ms interaction; 6–15 s low-amplitude ambient signal; custom cubic easing |
| Focus                    | 3 px mint outline with 3 px offset                                               |

Rendered surfaces:

- [Landing page](../design/visual-lock/signal-landing.png)
- [Command Center](../design/visual-lock/signal-command.png)
- [Patch Review](../design/visual-lock/signal-patch.png)
- [Interactive prototype](../design/visual-lock/round-2.html#cinematic-landing)

## Direction D — Kinetic Studio

**Thesis:** Ripple turns operational complexity into visible, controllable movement. The interface should feel bright, physical, confident, and unmistakably alive.

- Cool near-white canvas with solid vermilion, acid lime, cobalt, and black; no purple/blue AI gradients.
- Bricolage Grotesque for expressive product typography and DM Mono for evidence/status labels.
- A segmented ripple loop, marker reveals, hard offset shadows, physical panels, and a workflow ticker form one coherent motion system.
- The landing page presents the real product as an art-directed object rather than a generic screenshot beneath a marketing headline.
- Authenticated screens become flatter and denser but retain the same outline weight, color logic, circular evidence nodes, and physical feedback.
- Motion: marker wipes once, product planes settle and respond slightly to pointer position, loop segments travel, and controls compress physically on activation.
- Reduced motion: ticker, path travel, floats, marker wipes, and pointer tilt stop; all state changes remain immediate and textual.

Token hypothesis:

| Role                         | Value                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------- |
| Canvas / working surface     | `#F0F3EF` / `#FBFCF8`                                                         |
| Primary / secondary text     | `#111410` / `#6F756E`                                                         |
| Primary signal               | vermilion `#FF5838`                                                           |
| Changed / verified / related | vermilion / acid lime `#C8FF3D` / cobalt `#4E6CFF`, always paired with labels |
| Typography                   | Bricolage Grotesque and DM Mono; openly licensed Google fonts                 |
| Radius / depth               | 8–19 px; 1.5–2 px rules; 4–14 px hard offset shadows                          |
| Motion                       | 150–180 ms physical feedback; 5–24 s branded loop/ticker movement             |
| Focus                        | 3 px cobalt outline with 3 px offset                                          |

Rendered surfaces:

- [Landing page](../design/visual-lock/kinetic-landing.png)
- [Command Center](../design/visual-lock/kinetic-command.png)
- [Patch Review](../design/visual-lock/kinetic-patch.png)
- [Interactive prototype](../design/visual-lock/round-2.html#kinetic-landing)

## Selection and production lock

**Selected: Direction C, Cinematic Signal.** The owner selected Direction C before production implementation. Its signal-ring motif now maps from the landing composition to the causal graph, pipeline state, focus treatment, and verification seal.

Direction D is intentionally not a light variant of C. It is more energetic, optimistic, and memorable at a glance, but its expressive density will require tighter discipline when extended to long technical content.

Direction D remains a historical research artifact and must not be blended into production. The production lock uses Manrope, Instrument Serif, DM Mono, obsidian surfaces, coral and amber signals, mint verification, concentric causal rings, and reduced-motion-safe transitions. The smallest interface copy received a restrained 1 to 1.5 px legibility lift after owner review, with a higher-contrast quiet token validated by axe.
