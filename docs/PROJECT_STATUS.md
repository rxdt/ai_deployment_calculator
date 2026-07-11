> Handoff. Keep it short and current.

## State

- App matches the design/screenshot: five preset chips (Llama 8B, Llama 70B,
  Mixtral, Gemma 9B, SDXL — SDXL switches to `image_diffusion`); headline
  stat-chip row (Model Weights, KV Cache/Activations, Concurrency/Micro Batch,
  Spare %) from the report breakdown + fit meter; three-across Model params row
  (Total Parameters | Unit | Precision); the intro subtitle; and centered
  "MODEL"/"DEPLOYMENT" legends. Legend color stays foreground so the primary
  green accent stays reserved for the answer.
- Hero GPU examples are per-card, matching the design's linked-name /
  muted-name split. Each `HardwareTier` carries a `GpuCard[]` (`{ name, url? }`)
  instead of one `examples` string; `HardwareRecommendation` gains
  `exampleCards`, and the hero renders each card via `gpuExampleNodes` (in
  `app-dom.ts`) — a green external link (`target=_blank`,
  `rel="noopener noreferrer"`, underlined for a non-color cue) when the card has
  a product page, muted text otherwise. Product URLs reuse the design bundle's
  deep links where it named them (RTX 4060 / 4080 / 4090 / 6000 Ada) and
  otherwise point at NVIDIA's stable series / data-center landing pages; SKUs
  without a canonical page, sharded pools, and generic descriptors stay
  name-only. This removed the old string round-trip: `hardware.ts` built a
  descriptor and `result-format.ts` re-parsed it — the `gpuExamples` parser is
  gone, the tier's plain-text descriptor is derived from the card list, and the
  redundant trailing "class" on the examples line is dropped now that the class
  line already reads "N GB GPU hardware tier". The static-HTML seed carries the
  two default 24 GB links so first paint still equals the hydrated render.

## Checks

- `pnpm gate`: PASS (0 issues) — format, eslint, stylelint, html-validate,
  typecheck, schema, depcruise, knip, cspell, spectral, semgrep, secretlint,
  audit, build, coverage, e2e, Lighthouse (CLS back within budget after seeding
  the hero GPU card).
- Unit tests: PASS (458), coverage 100% stmts/branches/funcs/lines (gate
  enforced). This iteration rewrote the recommended-GPU-examples test in
  `app.test.ts` to prove the examples render on the hero card (not the collapsed
  Why panel).
- Playwright e2e: PASS across desktop-chrome / desktop-safari / iphone / pixel /
  small-320 / tablet. New: the recommended-GPU examples render on the hero GPU
  card without expanding a panel (calculator.spec); the one-viewport
  no-scroll / no-overflow contracts and the sub-120px hero-card height still hold
  on every breakpoint (responsive.spec).
- CSS bundle 13.2 kB raw / 3.1 kB gzip, under the 13 kB size-limit budget
  (size-limit measures the compressed payload).

## Blockers

- Design import via the claude_design MCP (`/design-login`) is unavailable in
  this non-interactive session; matched the design from the checked-in
  `scratchpad/professional-calculator-redesign` bundle + screenshots instead.

## Next

- Per-card GPU links now done. Remaining polish is content, not structure: some
  linkable SKUs stay muted because I did not have a canonical NVIDIA URL I was
  confident would not 404 (RTX 5000 Ada, RTX A6000, L40S, H800, B200). Adding
  verified deep links for those would turn more names green — a data-only edit
  to `HARDWARE_TIERS` in `hardware.ts`.
- Deployment group already matches the design's two-across layout. Advanced
  panel keeps its quarter-width flex layout (`.advanced[open] .field`).
