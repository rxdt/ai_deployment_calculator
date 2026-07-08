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
- This iteration added app-level coverage for the contracted main controls,
  rare advanced controls, and immediate adaptive rerendering from workload
  family / execution mode changes without form submit.
- `specs/frontend.md` now marks verified UI contract items complete: parameter
  units, main controls, advanced controls, fractional parameters, QLoRA forced
  controls, KV precision visibility/options, workload label, adaptive rerender,
  GitHub/brand header, four details panels, and output disclaimer.

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
  passes: 59 tests.
- `pnpm preflight` passes.
- `pnpm gate` passes format, eslint, style, html, typecheck, harness types,
  schema, dependency-cruiser, deadcode, spelling, workflow lint, secrets, audit,
  build, e2e, and Lighthouse. `semgrep` is not installed and is skipped.
- `pnpm gate` fails in forbidden harness-owned coverage tests:
  `harness/cli.test.ts` setup cases expect statuses `0`, `1`, or `7` but
  receive status `2`.

## Blockers

- No current frontend behavior blocker.
- `harness/cli.test.ts` is forbidden to agents, so the gate coverage failure
  needs a human harness fix or approval.

## Next

- Human fix or approve the forbidden harness setup-status failures.
- Continue the next focused frontend spec item after the gate result is current.
