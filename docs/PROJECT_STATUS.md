> Handoff. Keep it short and current.

## State

- Preset row now matches the design/screenshot: five chips in order Llama 8B,
  Llama 70B, Mixtral, Gemma (9B), SDXL. SDXL is the first `image_diffusion`
  preset (switches the workload family). Old "Gemma 2B" chip replaced by the
  design's "Gemma" (9B).
- Added the design's headline stat-chip row under the hero (Model Weights, KV
  Cache/Activations, Concurrency/Micro Batch, Spare %), sourced from the report
  breakdown + fit meter. `ReportPayload` gains a `statChips` field. Grid is 4
  across on the wide layout, 2x2 at <= 48em; no horizontal overflow at 320–1440.

## Checks

- Playwright `responsive.spec`: PASS (162) across desktop / desktop-safari /
  iphone / tablet, incl. the new "HUD labels render the widely-spaced uppercase
  treatment" case (status-strip letter-spacing + uppercased/spaced legends, with
  the no-scroll and no-horizontal-overflow contracts re-checked) on both
  one-viewport breakpoints, plus the "decorative atmosphere stays behind content"
  case and the axe scan (no contrast regression).
- `pnpm preflight`: PASS (0 issues) — prettier, eslint, stylelint, html-validate.
- CSS bundle 12.2 kB, under the 13 kB size budget.
- `pnpm gate`: PASS (0 issues) — decoration is CSS-only + one additive e2e, so
  100% coverage held and Lighthouse stayed green; backgrounds add no layout box,
  so CLS and the no-scroll contract were unaffected.

## Blockers

## Next
