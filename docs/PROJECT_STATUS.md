> Handoff. Keep it short and current.

## State

- Branch: `stub-real-tools-in-tests`; HEAD before this iteration: `c116cbb`.
- Iteration 1/3 scope: compact shippability visual pass from
  `specs/frontend.md` — the reference's hero usage/fit bar.
- Add: hero fit meter. A slim green `<meter>` reads the recommended GPU class
  as a consumed budget; the hero caption now reads
  "Fits a N GB card with N GB usable headroom (N% spare)". The bar hides and the
  caption reverts to "The workload needs N GB usable VRAM" when no single class
  fits (no model, overflow, or a sharded pool with no fit).
- Pure logic: `fitMeter()` in `src/result-format.ts` (fill percent + summary,
  or null). Rendering: `renderFitMeter()` in `src/app.ts`. Styling: `.fit-meter`
  in `src/styles.css` (green primary = fit/health per `specs/DESIGN.md`).
- Tests: `src/result-format.test.ts` covers single-card, 8B, sharded-pool, and
  no-fit cases; `src/app.test.ts` (`hero fit meter` describe) proves the meter
  value/hidden state and caption; `tests/responsive.spec.ts` proves the meter is
  visible, in viewport, value 93, and hides on overflow without breaking the
  one-viewport / hero-height contracts. Axe passes on all viewports.

## Checks

- `pnpm --dir frontend exec vitest run src/result-format.test.ts src/app.test.ts src/report.test.ts --config ../harness/vitest.config.js`: PASS.
- `pnpm --prefix harness exec playwright test --config playwright.config.js ../frontend/tests/responsive.spec.ts -g "fit meter|answer dominant|collapsed default estimate fits|axe accessibility"`: PASS.
- `pnpm preflight`: PASS.
- `pnpm gate`: see final run in this iteration.

## Blockers

- The claude_design MCP import in `specs/frontend.md` remains blocked: the
  `design` MCP server surfaces tools but is not authenticated, and
  `/design-login` needs interactive auth unavailable in this run.
- Unrelated unstaged `PROMPT.md` changes are forbidden for agents and left for
  human review.
- No code blocker for the scoped fit-meter work.

## Next

- Reference gaps still open: compact breakdown stat cards (model weights / KV
  cache / concurrency / spare) and preset chips (Llama 8B, 70B, Mixtral, ...).
  Both must respect the one-viewport no-scroll contract before landing.
- Optional: turn the fit meter amber when the workload is a tight fit (near the
  class budget) to signal constraint per `specs/DESIGN.md`.
</content>
</invoke>
