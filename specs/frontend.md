# Frontend Spec

## Priority

Ship a compact, trustworthy VRAM calculator today. Preserve naming, calculator correctness, accessibility, and responsive behavior.

## Current Contract

- [ ] Implement this within our ruleset and linting: `scratchpad/professional-calculator-redesign` and `specs/Screenshot 2026-07-09 at 11.23.19 PM.png` and `scratchpad/professional-calculator-redesign/project/screenshots/Screenshot 2026-07-10 at 12.29.26 AM.png`. Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project: https://claude.ai/design/p/b368203b-856d-480e-8103-b1977a6fe1a3?file=VRAM+Calculator.dc.html. Implement: VRAM Calculator.dc.html
  - [x] Preset row matches the design's five chips in order: Llama 8B, Llama
    70B, Mixtral, Gemma, SDXL. SDXL loads the `image_diffusion` family (the
    only non-text-generation preset). Mixtral keeps the accurate 46.7B/12.9B
    published counts rather than the design's rounded 47B/13B.
  - [x] Headline stat-chip row under the hero: Model Weights, KV Cache (or
    Activations for non-decoder families), Concurrency (or Micro Batch when
    training), and Spare %. Values come from the calculator's own breakdown and
    fit meter, so they stay consistent with the estimate. Four across on the
    wide layout, 2x2 once the results column narrows (<= 48em).
  - [x] Model group parameter row matches the design's three-across layout:
    Total Parameters | Unit | Precision share one row beneath the full-width
    Model Family select, instead of wrapping two-then-one. Fields keep
    `min-width: 0` so the trio shrinks to fit a narrow input pane rather than
    overflow.
  - [x] Intro subtitle under the h1 ("Estimate VRAM footprint and hardware fit
    for an AI workload."), restoring the copy the `.intro p` styles already
    targeted. The reclaimed row from the three-across params layout gives the
    input pane the vertical headroom the subtitle needs to stay within one
    viewport.
  - [x] Recommended-GPU examples ("e.g. RTX 3090 / RTX 4090") surface on
    the hero GPU card beneath the class value, as the design shows, instead of
    only inside the collapsed "Why this recommendation" panel. The examples and
    class group at the bottom of the secondary hero card so the space-between
    layout keeps them together; the card's example row still drops out when no
    tier has concrete examples (no model, or an overflow recommendation). The
    class + examples text is seeded into the static HTML (matching the default
    estimate) so first paint equals the hydrated render, keeping Lighthouse CLS
    within budget; both stay inside the one-viewport contract and the sub-120px
    hero-card height.
  - [x] Each example card is per-card data (`GpuCard { name, url? }`) on the
    hardware tier, not one descriptor string, so a card with a product page
    renders as a green external link (`target=_blank`, `rel="noopener
    noreferrer"`) while name-only cards (generic descriptors, sharded pools, or
    SKUs without a canonical page) stay muted text, matching the design's
    linked-name / muted-name split. Links carry an underline so they are
    distinguishable from muted cards without relying on color alone. The tier's
    plain-text descriptor (used in reasoning copy) is derived from the same card
    list, dropping the old redundant "class" suffix now that the hero class line
    already reads "N GB GPU hardware tier".
  - [x] Section legends ("MODEL" / "DEPLOYMENT") center over their fieldset,
    matching the design's centered HUD headers instead of the default left edge.
    Legend color stays foreground (not the design's green) so the primary green
    accent remains reserved for the answer.

The design bundle is a raw claude.ai/design export (`{{ }}` templates, inline
styles, upload `.ts`) and cannot pass `eslint .` or `html-validate`. It lives
under `scratchpad/` (git-ignored, excluded from every linter). Use it as the style/html/javascript to copy from. Our app must look like the screenshot

## Checks

- Focused unit loop:
  `pnpm --dir frontend exec vitest run src/report.test.ts src/app.test.ts --config ../harness/vitest.config.js`
- Required loop checks: `pnpm preflight`, then `pnpm gate` (only run once if you made significant changes, very slow on lighthouse).

## Notes

- The reference files are distilled notes, not raw third-party exports, so the
  repo-wide HTML validator can check them.
