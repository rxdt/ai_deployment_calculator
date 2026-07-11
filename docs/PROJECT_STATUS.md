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
- Restored the intro subtitle ("Estimate VRAM footprint and hardware fit for an
  AI workload.") the `.intro p` styles already targeted but the HTML had dropped.

## Checks

- `pnpm gate`: PASS (0 issues) — format, eslint, stylelint, html-validate,
  typecheck, schema, depcruise, knip, cspell, spectral, semgrep, secretlint,
  audit, build, coverage, e2e, Lighthouse.
- Unit tests: PASS (233), coverage 100% stmts/branches/funcs/lines. New
  `statChips` branches (KV vs activations, concurrency vs micro batch, spare vs
  em dash) are covered in `report.test.ts`; chip rendering is covered in
  `app.test.ts`.
- Playwright e2e: PASS (264) across desktop / desktop-safari / iphone / tablet.
  Stat-chip row added no horizontal overflow at 320–1440 (4-across, 2x2 <=48em).
- CSS bundle 12.9 kB, under the 13 kB size budget.

## Blockers

- Design import via the claude_design MCP (`/design-login`) is unavailable in
  this non-interactive session; matched the design from the checked-in
  `scratchpad/professional-calculator-redesign` bundle + screenshots instead.

## Next

Largest remaining screenshot gap (rendered current app is rougher than the
design): the input pane's field layout. The design puts related controls in a
6-column grid (e.g. Total Parameters | Unit | Precision on one row) inside
bordered cards; our `.group` fieldsets still stack fields full-width. This is
the dominant visual difference left and the highest-value next increment, but it
touches the responsive layout broadly — budget time to re-verify the 264 e2e
no-scroll / no-overflow contracts across all four breakpoints.
Smaller follow-ups: surface GPU examples ("e.g. RTX 4090, L4") on the hero GPU
card as the design does (currently only in the "Why" panel).
