> Handoff. Keep it short and current.

## State

- Current branch: `main`.
- Static Vite + TypeScript calculator; frontend calculations and report
  rendering are the source of truth.
- Default output contract remains: hero glance first, four collapsed result
  detail panels, no `Accuracy` or `Your GPU Fit`, and default inference warnings
  hidden.
- `Formula used` shows canonical terms:
  `Required_GB`, `Weights_GB`, `Working_Memory_GB`, `Training_State_GB`,
  `Runtime_Overhead_GB`, `Buffer`, and `Safety_Buffer_GB`.
- This iteration added app-level coverage that the real HTML assumptions output
  renders both `KV heads used` and `Conservative KV heads`.
- Frontend `data-*` helpers now use lint-approved `dataset` dot access.
- `specs/frontend.md` now marks conservative KV-head output complete and lists
  pnpm commands for frontend tools.
- Agent commit `Verify conservative KV assumptions render` is on `main`;
  commit-time preflight passed after the hook kept forbidden harness dirt out.

## Commands

- Focused app/report unit tests:
  `pnpm --dir frontend exec vitest run src/app.test.ts src/report.test.ts`
- Full unit + coverage: `pnpm --prefix frontend run test:coverage`
- Build: `pnpm --prefix frontend run build`
- Preview: `pnpm --prefix frontend run preview -- --port 5174`
- Playwright:
  `pnpm --dir frontend exec playwright test --config ../harness/playwright.config.js`
- Lighthouse:
  `./harness/node_modules/.bin/lhci autorun --config harness/lighthouserc.cjs`
- Preflight: `pnpm preflight`
- Gate: `pnpm gate`

## Checks

- `pnpm --dir frontend exec vitest run src/app.test.ts src/report.test.ts`
  passes: 55 tests.
- Direct `pnpm preflight` reached eslint/stylelint/html clean, then failed
  format while forbidden `harness/tsconfig.app.json` was dirty. The same
  preflight passed in the successful commit hook after harness exclusion.
- `pnpm gate` typecheck/build/e2e/Lighthouse pass, but the gate fails on
  forbidden harness-owned checks: `harness/tsconfig.app.json` formatting,
  dependency-cruiser `TS18003` from that tsconfig include set, and harness
  coverage tests for setup/include expectations. Local `semgrep`/`osv-scanner`
  are missing and reported as skipped, not failing.
- Current working tree has only forbidden `harness/tsconfig.app.json` dirty.

## Blockers

- `harness/tsconfig.app.json` is forbidden to agents. Preflight formats
  `harness/` and reports that file as non-Prettier-compliant; gate also depends
  on its include set for dependency-cruiser and harness coverage expectations.
  Direct `pnpm gate` is blocked until a human fixes or approves that
  harness-owned file.
- No known frontend behavior blocker for this iteration; focused tests pass.

## Next

- Human fix/approve the forbidden harness formatting issue.
- Then run `pnpm gate` and continue the next focused frontend spec item.
