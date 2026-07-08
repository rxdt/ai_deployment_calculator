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
- Default inference renders no warnings; training, MoE, and sharded-tier guidance
  remain conditional.
- A small disclaimer is rendered below the app outputs.

## Commands

- App/report unit:
  `pnpm --dir frontend exec vitest run src/app.test.ts src/report.test.ts`
- Build: `npm --prefix frontend run build`
- Coverage: `npm --prefix frontend run test:coverage`
- Playwright direct:
  `pnpm --dir frontend exec playwright test --config ../harness/playwright.config.js`
- Lighthouse direct:
  `./harness/node_modules/.bin/lhci autorun --config harness/lighthouserc.cjs`
- Preflight: `pnpm preflight`
- Gate: `pnpm gate`

## Checks

- Targeted unit:
  `pnpm --dir frontend exec vitest run src/state.test.ts src/report.test.ts src/calculator.test.ts`
  passes: 75 tests.
- Latest app/report unit:
  `pnpm --dir frontend exec vitest run src/app.test.ts src/report.test.ts`
  passes: 50 tests.
- `npm --prefix frontend run test:coverage` passes: 124 tests, 100% coverage.
- `npm --prefix frontend run build` passes.
- Direct Playwright passes: 96 tests across desktop, mobile, small, and tablet
  projects.
- Direct Lighthouse previously passed in the current dirty tree, but the latest
  `pnpm gate` Lighthouse step failed `network-dependency-tree-insight`.
- Targeted stylelint passes:
  `pnpm --prefix harness exec stylelint '../frontend/**/*.css' --config stylelint.config.js --ignore-path .stylelintignore --max-warnings=0 --allow-empty-input`.
- Latest `pnpm preflight` passes: 0 issues.
- Latest `pnpm gate` passes static checks, build, and e2e; it fails during
  coverage on forbidden harness setup tests and during Lighthouse.

## Blockers

- Do not edit forbidden dirty harness files. Current working tree still includes
  pre-existing edits under `harness/`.
- `pnpm gate` coverage fails in forbidden `harness/cli.test.ts`: six setup
  assertions receive status `2` instead of the expected setup result.
- `pnpm gate` Lighthouse fails `network-dependency-tree-insight` with score `0`
  and reports render-blocking warnings.
- `frontend/package.json` has unstaged human-owned changes, including Vite
  scripts and CSS budget edits; do not stage them without review.
- Current dirty tree still includes human-owned `.htmlvalidateignore` changes,
  deleted `frontend/.syncpackrc.json`, and deleted `harness/.htmlvalidateignore`;
  leave these for human review.
- `npm --prefix frontend run test:e2e` currently resolves
  `harness/harness/playwright.config.js` and fails; use the direct Playwright
  command above until the human-owned harness script is fixed.
