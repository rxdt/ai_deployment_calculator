> Handoff. Keep it short and current.

## State

- Current branch: `harness-setup-config-overrides`.
- Static Vite + TypeScript calculator; frontend calculations and report
  rendering are the source of truth.
- `frontend/src/styles.css` now contains the first real compact dark responsive
  styling pass using stylelint-approved design tokens.
- Header brand is `~VRAM-calculator` text, not a link; GitHub remains a labeled
  repository link with the local logo asset.
- Default collapsed outputs fit the tested desktop and mobile viewports.
- A small disclaimer is rendered below the app outputs.

## Commands

- App unit: `pnpm --dir frontend exec vitest run src/app.test.ts`
- Build: `npm --prefix frontend run build`
- Coverage: `npm --prefix frontend run test:coverage`
- Playwright direct:
  `pnpm --dir frontend exec playwright test --config ../harness/playwright.config.js`
- Preflight: `pnpm preflight`
- Gate: `pnpm gate`

## Checks

- `pnpm --dir frontend exec vitest run src/app.test.ts` passes: 33 tests.
- `npm --prefix frontend run build` passes.
- Direct Playwright passes: 96 tests across desktop, mobile, small, and tablet
  projects.
- Targeted stylelint passes:
  `pnpm --prefix harness exec stylelint '../frontend/**/*.css' --config stylelint.config.js --ignore-path .stylelintignore --max-warnings=0 --allow-empty-input`.
- Latest `pnpm preflight` passes: 0 issues.
- Latest `pnpm gate` passes static checks, build, and e2e, but fails on
  forbidden harness coverage and Lighthouse assertions.

## Blockers

- Do not edit forbidden dirty harness files. Current working tree still includes
  pre-existing edits under `harness/`.
- `pnpm gate` coverage fails in forbidden `harness/cli.test.ts`: six setup
  assertions receive status `2` instead of the expected setup result.
- `frontend/package.json` has an unstaged CSS budget update (`6 B` -> `13 kB`);
  preflight keeps that path out of the commit, so a human should decide how to
  land the budget change.
- `npm --prefix frontend run test:e2e` currently resolves
  `harness/harness/playwright.config.js` and fails; use the direct Playwright
  command above until the human-owned harness script is fixed.
- Lighthouse CLS is fixed, but Lighthouse still fails
  `network-dependency-tree-insight` and reports one render-blocking resource.
