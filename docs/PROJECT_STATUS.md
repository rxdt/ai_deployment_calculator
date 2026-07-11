> Handoff. Keep it short and current.

## State

- App matches the design/screenshot: five preset chips (Llama 8B, Llama 70B,
  Mixtral, Gemma 9B, SDXL — SDXL switches to `image_diffusion`); headline
  stat-chip row (Model Weights, KV Cache/Activations, Concurrency/Micro Batch,
  Spare %) from the report breakdown + fit meter; three-across Model params row
  (Total Parameters | Unit | Precision); the intro subtitle; and centered
  "MODEL"/"DEPLOYMENT" legends. Legend color stays foreground so the primary
  green accent stays reserved for the answer.
- Multi-GPU parallelism callout (the design's amber `warn.png` banner) now
  ships: when the recommended/speed tier requires sharding (a sharded tier is
  recommended, or a single-GPU overflow needs sharding), an amber note beneath
  the stat-chip row reads "Exceeds single-GPU capacity — needs tensor / pipeline
  parallelism:" followed by FSDP · ZeRO · vLLM · TP links (new-tab, `rel`
  guarded, underlined). `buildReport` sets `ReportPayload.parallelismStrategies`
  (empty for any single-GPU fit); `renderParallelismCallout` (in `app-dom.ts`,
  co-located with the relocated `renderGpuExamples`) fills the links and toggles
  the callout `hidden`. Both relocated helpers resolve their target through a
  new module-local `dataOut(root, name)` (mirroring `dataSlot`) that matches the
  harness-allowlisted generic `[data-out]` selector, since per-value
  `[data-out="…"]` selectors are rejected by the DOM-preference check. It stays
  hidden for the default 7B fit, so it adds no
  height or CLS to the common case. Amber reuses the tight-fit meter's
  `--color-amber` (not the design's `#fbbf24`) so the primary green stays
  reserved for the answer.
- Hero GPU examples are per-card, matching the design's linked-name /
  muted-name split. Each `HardwareTier` carries a `GpuCard[]` (`{ name, url? }`)
  instead of one `examples` string; `HardwareRecommendation` gains
  `exampleCards`, and the hero renders each card via `renderGpuExamples` (in
  `app-dom.ts`, wrapping the internal `gpuExampleNodes`) — a green external link
  (`target=_blank`,
  `rel="noopener noreferrer"`, underlined for a non-color cue) when the card has
  a product page, muted text otherwise. Product URLs reuse the design bundle's
  deep links where it named them (RTX 4060 / 4080 / 4090 / 6000 Ada) and
  otherwise point at NVIDIA's stable series / data-center landing pages. The
  RTX 5000 Ada, RTX A6000, and L40S now link too (each verified against its own
  NVIDIA product page this iteration), leaving only cards with no canonical
  single-GPU page muted: generic descriptors, sharded pools, the B200 (only on
  multi-GPU system pages), and the H800 (region-specific variant). This removed
  the old string round-trip: `hardware.ts` built a
  descriptor and `result-format.ts` re-parsed it — the `gpuExamples` parser is
  gone, the tier's plain-text descriptor is derived from the card list, and the
  redundant trailing "class" on the examples line is dropped now that the class
  line already reads "N GB GPU hardware tier". The static-HTML seed carries the
  two default 24 GB links so first paint still equals the hydrated render.

## Checks

- `pnpm gate`: PASS (0 issues) — format, eslint, stylelint, html-validate,
  typecheck, schema, depcruise, knip, cspell, spectral, semgrep, secretlint,
  audit, build, coverage, e2e, Lighthouse (callout is hidden by default, so CLS
  stays within budget).
- Unit tests: PASS (467), coverage 100% stmts/branches/funcs/lines (gate
  enforced). This iteration added `report.test.ts` coverage that the parallelism
  strategies appear for a sharded tier and a single-GPU overflow but stay empty
  for a single-GPU fit, plus `app.test.ts` coverage that the callout stays
  hidden by default and renders the four framework links (href/target/rel) once
  the workload exceeds a single card, then hides again when it fits.
- Playwright e2e: PASS across desktop-chrome / desktop-safari / iphone / pixel /
  small-320 / tablet. The default deployment now also asserts the parallelism
  callout is hidden, and a new case drives Full training to assert the amber
  callout surfaces with the FSDP/ZeRO/vLLM/TP links (calculator.spec); the
  one-viewport no-scroll / no-overflow contracts and the sub-120px hero-card
  height still hold on every breakpoint (responsive.spec).
- CSS bundle 13.2 kB raw / 3.1 kB gzip, under the 13 kB size-limit budget
  (size-limit measures the compressed payload).

## Blockers

- Design import via the claude_design MCP (`/design-login`) is unavailable in
  this non-interactive session; matched the design from the checked-in `docs/PROJECT_STATUS.md` and
  `docs/frontend` bundle + screenshot `docs/Screenshot 2026-07-10 at 12.29.26 AM.png` instead.

## Next

- Per-card GPU links now done, and the linkable-SKU backlog is cleared: RTX 5000
  Ada, RTX A6000, and L40S got verified NVIDIA product-page links this iteration.
  Only B200 and H800 remain muted on purpose — NVIDIA publishes no standalone
  single-GPU page for either (B200 lives on multi-GPU DGX/HGX system pages; H800
  is a region-specific H100 variant), so linking would point at a mismatched
  page. Revisit if NVIDIA ships dedicated pages.
- Deployment group already matches the design's two-across layout. Advanced
  panel keeps its quarter-width flex layout (`.advanced[open] .field`).
