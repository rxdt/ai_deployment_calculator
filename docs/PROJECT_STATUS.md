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
- Recommended-GPU examples now surface on the hero GPU card ("e.g. RTX 3090 /
  RTX 4090 class") beneath the class value, matching the design, instead of only
  inside the collapsed "Why this recommendation" panel. Class + examples are
  wrapped in `.hero-gpu-detail` so the card's space-between layout keeps them
  grouped at the bottom, aligned with the primary card's fit line. The examples
  line makes the secondary card the taller of the two, so its class + examples
  text is seeded into the static HTML (matching the default estimate) to keep
  first paint equal to the hydrated render — without the seed the post-load fill
  grew the hero row and pushed Lighthouse CLS to 0.81 (< 0.9). Both stay within
  the one-viewport contract and the sub-120px hero-card height at desktop 720.

## Checks

- `pnpm gate`: PASS (0 issues) — format, eslint, stylelint, html-validate,
  typecheck, schema, depcruise, knip, cspell, spectral, semgrep, secretlint,
  audit, build, coverage, e2e, Lighthouse (CLS back within budget after seeding
  the hero GPU card).
- Unit tests: PASS (233), coverage 100% stmts/branches/funcs/lines. New
  `statChips` branches (KV vs activations, concurrency vs micro batch, spare vs
  em dash) are covered in `report.test.ts`; chip rendering is covered in
  `app.test.ts`.
- Playwright e2e: PASS across desktop-chrome / desktop-safari / iphone / pixel /
  small-320 / tablet. New: the recommended-GPU examples render on the hero GPU
  card without expanding a panel (calculator.spec); the one-viewport
  no-scroll / no-overflow contracts and the sub-120px hero-card height still hold
  on every breakpoint (responsive.spec).
- CSS bundle 12.9 kB, under the 13 kB size budget.

## Blockers

- Design import via the claude_design MCP (`/design-login`) is unavailable in
  this non-interactive session; matched the design from the checked-in
  `scratchpad/professional-calculator-redesign` bundle + screenshots instead.

## Next

- Center the fieldset legends (design centers "MODEL" / "DEPLOYMENT"); ours are
  left-aligned. Low-risk, no responsive impact — the HUD-label e2e checks only
  uppercase + letter-spacing, not alignment.
- The hero GPU-examples line renders our single descriptor string ("RTX 3090 /
  RTX 4090 class") as one muted run; the design links each card name (green
  "RTX 4090", muted "L4"). Matching that needs the hardware tier data to expose
  per-card name/url objects instead of one `examples` string — a `hardware.ts`
  data change, out of scope for this result-side relocation.
- Deployment group already matches the design's two-across layout; the only
  remaining input-pane grid gap was the Model params row, now done. Advanced
  panel keeps its quarter-width flex layout (`.advanced[open] .field`).
