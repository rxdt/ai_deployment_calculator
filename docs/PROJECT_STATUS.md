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
- Model group parameter row now matches the design: Total Parameters | Unit |
  Precision sit three-across on one row (new `.field--third` / `--layout-third`
  token) beneath the full-width Model Family select, replacing the old
  two-then-one wrap. The reclaimed row freed the headroom to restore the intro
  subtitle ("Estimate VRAM footprint and hardware fit for an AI workload."),
  which had been reverted for pushing the pane past the one-viewport contract.

## Checks

- `pnpm gate`: PASS (0 issues) — format, eslint, stylelint, html-validate,
  typecheck, schema, depcruise, knip, cspell, spectral, semgrep, secretlint,
  audit, build, coverage, e2e, Lighthouse.
- Unit tests: PASS (233), coverage 100% stmts/branches/funcs/lines. New
  `statChips` branches (KV vs activations, concurrency vs micro batch, spare vs
  em dash) are covered in `report.test.ts`; chip rendering is covered in
  `app.test.ts`.
- Playwright e2e: PASS (276) across desktop-chrome / desktop-safari / iphone /
  pixel / small-320 / tablet. New: three-across params row shares one row
  (responsive.spec) and the intro subtitle renders (calculator.spec); the
  one-viewport no-scroll / no-overflow contracts still hold on every breakpoint.
- CSS bundle 12.9 kB, under the 13 kB size budget.

## Blockers

- Design import via the claude_design MCP (`/design-login`) is unavailable in
  this non-interactive session; matched the design from the checked-in
  `scratchpad/professional-calculator-redesign` bundle + screenshots instead.

## Next

- Surface GPU examples ("e.g. RTX 4090, L4") on the hero GPU card as the design
  does (currently only in the "Why" panel). Contained result-side change; the
  examples data already exists via `gpuExamples()` — watch the collapsed
  one-viewport result stack (`.results` scrolls internally, so keep "Memory
  breakdown" `toBeInViewport` on desktop 720).
- Center the fieldset legends (design centers "MODEL" / "DEPLOYMENT"); ours are
  left-aligned. Low-risk, no responsive impact — the HUD-label e2e checks only
  uppercase + letter-spacing, not alignment.
- Deployment group already matches the design's two-across layout; the only
  remaining input-pane grid gap was the Model params row, now done. Advanced
  panel keeps its quarter-width flex layout (`.advanced[open] .field`).
