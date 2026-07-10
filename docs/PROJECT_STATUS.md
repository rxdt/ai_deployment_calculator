> Handoff. Keep it short and current.

## State

- Branch: `stub-real-tools-in-tests`; HEAD: `4dce949`.
- Iteration 3/3 scope: land the preset chips (the last named reference gap) and
  keep every one-viewport / control-interaction contract green once they ship.
- Preset chips: one-click Gemma 2B / Llama 8B / Llama 70B / Mixtral chips that
  fill the form from `MODEL_PRESETS` (`src/presets.ts`) via `applyValues()`.
  They ship as static HTML (not JS-injected) so they hold their space at first
  paint and add no cumulative layout shift; `wirePresets()` only attaches the
  click behavior and throws on a stray node or an id absent from the catalog.
- Advanced panel fit (`4dce949`): the chip row adds height above the
  Advanced-assumptions summary. The open panel is an overlay that must drop
  *below* its summary (opening upward covers the MoE/main controls that tests
  and users still operate while it is open). To keep the downward panel inside
  one viewport, the input pane reclaims vertical rhythm: tighter inter-block gap
  (`--space-xs`, fieldsets keep their own field gap) and the redundant intro
  subtitle removed (the h1 + meta description already cover it).

## Also landed (concurrent, not this scope)

- Amber tight-fit meter (`6838fc9`): `fitMeter()` returns `isTight`
  (>=95% usable consumed), `renderFitMeter()` toggles `.fit-meter--tight`
  (`--color-amber`), caption leads with "Tight fit:" so color is not the sole
  signal.

## Checks

- `pnpm --prefix frontend run test:coverage`: PASS (226 tests, 100% branches).
- `pnpm --prefix harness exec playwright test --config playwright.config.js ../frontend/tests/calculator.spec.ts ../frontend/tests/responsive.spec.ts`: PASS (240), incl. all-expanded no-scroll and the 47B MoE control-entry case.
- `pnpm preflight`: PASS (0 issues).
- `pnpm gate`: run at the end of this iteration (Lighthouse CLS recovers once the
  chips stop shifting first paint).

## Blockers

- The claude_design MCP import in `specs/frontend.md` stays blocked: the
  `design` MCP server surfaces tools but is unauthenticated, and `/design-login`
  needs interactive auth unavailable in this run.
- `PROMPT.md` is a forbidden path for agents; its edits are left for human
  review and kept out of agent commits.
- The working tree saw concurrent edits during this iteration (overlay direction
  and the input-pane gap were reverted mid-run). The committed `4dce949` state
  is verified green; if a later revert reintroduces the upward overlay or the
  `--space-sm` inputs gap, `calculator.spec` (MoE) or the all-expanded no-scroll
  test will regress — re-apply `4dce949`'s downward overlay + `--space-xs` gap.

## Next

- Named reference gaps (compact status, result rows, fit meter incl. amber,
  breakdown cards, preset chips) are all done. Remaining spec item is the
  general visual pass against `docs/odoo.html`, `specs/dispel.html`,
  `specs/groundcover.html` under `specs/DESIGN.md`; pick only similarly scoped
  gaps that preserve the one-viewport no-scroll contract.
