> Handoff. Keep it short and current.

## State

- Current branch: `main`.
- Static Vite + TypeScript calculator; frontend calculations and report
  rendering are the source of truth.
- Default output contract: hero glance first, four collapsed result detail
  panels, no `Accuracy` or `Your GPU Fit`, and default inference warnings
  hidden.
- `Formula used` shows canonical terms:
  `Required_GB`, `Weights_GB`, `Working_Memory_GB`, `Training_State_GB`,
  `Runtime_Overhead_GB`, `Buffer`, and `Safety_Buffer_GB`.
- This iteration added app-level coverage for the output contract: first-glance
  hero slots stay outside collapsed detail panels, and why/calculation/formula/
  assumptions slots stay inside collapsed `<details>` panels.
- `specs/frontend.md` now marks the verified output contract and app/Playwright
  coverage items complete.

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
  passes: 60 tests.
- `pnpm preflight` passes.
- Final `pnpm gate` passes format, eslint, style, html, typecheck, harness
  types, schema, dependency-cruiser, deadcode, spelling, workflow lint, secrets,
  audit, build, e2e, and Lighthouse. `semgrep` is not installed and is skipped.
- Final `pnpm gate` fails in forbidden harness coverage tests:
  `harness/cli.test.ts` setup cases expect status `0`, `1`, or `7` but receive
  status `2`.

## Blockers

- No current frontend behavior blocker.
- `harness/cli.test.ts` is forbidden to agents, so the gate coverage failure
  needs a human harness fix or approval.
- No current frontend behavior blocker.

## Next

- Human fix or approve the forbidden harness setup-status failures.
- Continue the next focused frontend spec item after the gate result is current.
