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
- This iteration strengthened app coverage that hidden MoE state for
  non-MoE workload families cannot change the rendered VRAM total, speed, or
  warnings, and marked that frontend spec item complete.
- Agent commit `Verify hidden MoE rendering stays inert` is on `main`;
  commit-time preflight passed.
- This iteration changed the single visible form action label to `Reset` and
  updated app and Playwright assertions to match the frontend spec.

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

- `pnpm --dir frontend exec vitest run src/app.test.ts` passes: 39 tests.
- `pnpm --dir frontend exec playwright test --config ../harness/playwright.config.js frontend/tests/calculator.spec.ts frontend/tests/responsive.spec.ts`
  passes: 102 tests.
- `pnpm preflight` passes after staging only allowed files:
  `docs/PROJECT_STATUS.md`, `frontend/index.html`,
  `frontend/src/app.test.ts`, `frontend/tests/calculator.spec.ts`,
  `frontend/tests/responsive.spec.ts`, and `specs/frontend.md`.
- `pnpm gate` format/eslint/style/html/typecheck/build/e2e/Lighthouse pass.
  Gate fails in forbidden harness-owned coverage tests:
  `harness/cli.test.ts` setup cases expect status `0`, `1`, or `7` but receive
  status `2`. Local `semgrep` is missing and reported as skipped, not failing.
- Current branch has no known user-owned working-tree changes.

## Blockers

- `harness/cli.test.ts` is forbidden to agents. Direct `pnpm gate` is blocked
  until a human fixes or approves the harness setup status failures.
- No known frontend behavior blocker for this iteration; focused tests pass.

## Next

- Human fix/approve the forbidden harness setup status issue.
- Then run `pnpm gate` and continue the next focused frontend spec item.
