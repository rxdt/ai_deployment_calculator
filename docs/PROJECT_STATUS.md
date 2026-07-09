> Handoff. Keep it short and current.

## State

- Current branch: `main`.
- Static Vite + TypeScript calculator; frontend calculations and report
  rendering are the source of truth.
- Default output contract: hero glance first, four collapsed result detail
  panels, no `Accuracy` or `Your GPU Fit`, and default inference warnings
  hidden.
- The form now has one visible action: submit button `Reset`; there is no hidden
  submit control.
- Submit is the canonical reset path: it prevents navigation, zeroes inputs, and
  renders the empty estimate.
- `specs/frontend.md` marks the single-action UI contract complete.
- Overflow reports now include the sharded-tier speed warning whenever the speed
  estimate falls back to the top sharded tier.
- Speed-estimate tests now pin each workload family's throughput unit
  (`tokens/second`, `images/minute`, `clips/minute`, `rows/second`,
  `audio tokens/second`) and prove MoE active parameters yield a strictly faster
  estimate than the dense equivalent, replacing a loose regex assertion.

## Commands

- Focused app/report unit tests:
  `pnpm --dir frontend exec vitest run src/app.test.ts src/report.test.ts`
- Focused report unit tests:
  `pnpm --dir frontend exec vitest run src/report.test.ts`
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
- `pnpm --dir frontend exec vitest run src/report.test.ts` passes: 16 tests.
- `pnpm preflight` first failed only because no real work was staged; rerun
  after staging passed.
- Final `pnpm preflight` passes.
- Final `pnpm gate` passes format, eslint, style, html, typecheck, harness
  types, schema, dependency-cruiser, deadcode, spelling, workflow lint, secrets,
  audit, build, e2e, and Lighthouse. `semgrep` is not installed and is skipped.
- Final `pnpm gate` fails in forbidden harness coverage tests:
  `harness/cli.test.ts` setup cases expect status `0`, `1`, or `7` but receive
  status `2`.

## Blockers

- No current frontend behavior blocker.
- This iteration's sandbox denied every `pnpm`, `vitest`, and
  `node harness/harness.mjs` invocation ("requires approval"), so the strengthened
  speed-estimate tests could not be executed in-session; they were hand-verified
  against `workload-memory.ts` (`SPEED_STYLES` units and the MoE compute-weight
  branch). The loop hook must run `pnpm preflight`/`pnpm gate` to confirm green.
- `harness/cli.test.ts` is forbidden to agents, so the gate coverage failure
  needs a human harness fix or approval.

## Next

- Confirm `pnpm preflight` green once execution is permitted.
- Human fix or approve the forbidden harness setup-status failures.
