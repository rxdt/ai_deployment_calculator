> Handoff. Keep it short and current.

## State

- Branch: `stub-real-tools-in-tests`; HEAD before this iteration: `6d99e4c`.
- Iteration 2/3 scope: compact shippability visual pass from
  `specs/frontend.md` — the reference's compact breakdown stat cards.
- Add: "Memory breakdown" disclosure surfacing `report.breakdown`, which was
  computed but never rendered (dead data). Each non-zero memory component
  (model memory / context / activation / training / runtime reserve / safety
  margin) renders as a bordered mono stat card; values stay foreground, never
  the green answer accent, per `specs/DESIGN.md`.
- Layout: the panel fills the previously-empty result-grid cell beside
  "Assumptions used", so it adds no new collapsed row and keeps the
  one-viewport no-scroll contract. Cards wrap via flex (`--layout-half` basis)
  because the linter bans `fr` units and `repeat(auto-fit, ...)`.
- Wiring: `render()` in `src/app.ts` reuses `fillRows("breakdown-rows", ...)`
  and the shared row template; styling is `.breakdown` in `src/styles.css`.

## Prior iterations

- Iter 1: hero fit meter (`fitMeter()` in `src/result-format.ts`,
  `renderFitMeter()` in `src/app.ts`, `.fit-meter` in `src/styles.css`).

## Checks

- `pnpm --dir frontend exec vitest run src/report.test.ts src/app.test.ts src/result-format.test.ts --config ../harness/vitest.config.js`: PASS (97).
- `pnpm --prefix harness exec playwright test --config playwright.config.js ../frontend/tests/responsive.spec.ts -g "stay compact|collapsed default estimate fits|avoid page scroll|axe accessibility|fit meter"`: PASS (42).
- `pnpm preflight`: PASS.
- `pnpm gate`: see final run in this iteration.

## Blockers

- The claude_design MCP import in `specs/frontend.md` remains blocked: the
  `design` MCP server surfaces tools but is not authenticated, and
  `/design-login` needs interactive auth unavailable in this run.
- Unrelated unstaged `PROMPT.md` changes are forbidden for agents and left for
  human review.
- No code blocker for the scoped breakdown-cards work.

## Next

- Preset chips (Llama 8B, 70B, Mixtral, ...) remain the last named reference
  gap; must respect the one-viewport no-scroll contract before landing.
- Optional: turn the fit meter amber on a tight fit near the class budget.
