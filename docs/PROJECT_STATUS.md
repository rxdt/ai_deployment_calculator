> Handoff. Keep it short and current.

## State

- Branch: `stub-real-tools-in-tests`; HEAD: `6838fc9`.
- Iteration 2/5 scope: land the preset chips as static HTML instead of
  JS-injected markup, so the chip row holds its space at first paint (no layout
  shift) and the one-viewport no-scroll contract is measured against the same
  DOM the browser paints first.
- The four chips (Gemma 2B, Llama 8B, Llama 70B, Mixtral) now ship in
  `index.html` with `data-preset` ids. `wirePresets()` (formerly `buildPresets()`)
  matches each chip's id to `MODEL_PRESETS` and attaches the one-click load; an
  unknown id throws `Unknown preset chip: <id>` so HTML and catalog cannot drift
  silently. The load behavior, no-green-accent styling, and Reset-clears
  contract are unchanged from `54a3f84`.
- The chip helper in `app.test.ts` now `trim()`s `textContent`, because static
  markup carries surrounding whitespace the injected nodes did not; a new test
  asserts the unknown-id throw.

## Prior iterations

- Amber tight-fit meter (`6838fc9`): `fitMeter()` returns `isTight`
  (>=95% usable consumed), `renderFitMeter()` toggles `.fit-meter--tight`
  (`--color-amber`), and the caption leads with "Tight fit:" so color is never
  the sole signal.
- Presets landed as one-click chips (`src/presets.ts` + `applyValues()`) in
  `54a3f84`; breakdown stat cards (`.breakdown`) and the hero fit meter
  (`fitMeter()`) predate them.

## Checks

- `pnpm --dir frontend exec vitest run src/report.test.ts src/app.test.ts src/result-format.test.ts --config ../harness/vitest.config.js`: PASS (107).
- `pnpm --prefix harness exec playwright test --config playwright.config.js ../frontend/tests/responsive.spec.ts`: PASS (44), incl. all-expanded no-scroll and the axe scan.
- `pnpm preflight`: PASS (0 issues).
- `pnpm gate`: see final run in this iteration.

## Blockers

- The claude_design MCP import in `specs/frontend.md` stays blocked: the
  `design` MCP server surfaces tools but is unauthenticated, and `/design-login`
  needs interactive auth unavailable in this run.
- `PROMPT.md` is a forbidden path for agents; its edits are left for human
  review and kept out of agent commits.

## Next

- Named reference gaps (compact status, result rows, fit meter incl. amber,
  breakdown cards, preset chips) are all done. The remaining spec item is the
  general visual pass against `docs/odoo.html`, `specs/dispel.html`,
  `specs/groundcover.html` under `specs/DESIGN.md`; pick only similarly scoped
  gaps that preserve the one-viewport no-scroll contract.
