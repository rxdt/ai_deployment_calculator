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
- This iteration added a data-driven app test asserting the `MoE Model` control
  is exposed for exactly the MoE-applicable families
  (`text_generation`, `text_encoder`, `encoder_decoder`, `vision_language`,
  `custom`) and hidden for the other five, and marked that frontend spec item
  complete. Prior coverage only proved the `vision` case.
- This iteration added a `calculator.test.ts` unit test isolating the training
  branch of `memoryBreakdown` (`workload-memory.ts:292`): for a
  `text_generation` LoRA spec it proves the inference decoder KV cache and
  decoder scratch are dropped (`kvCacheGb = 0`,
  `inputActivationGb = Training_Activation_GB`). Previously only exact training
  totals pinned this indirectly. Clarified the spec's Training Activation
  Formula to match this implemented "adds no decoder scratch" behavior.

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
- This iteration could NOT run `pnpm preflight`, `pnpm gate`, or `vitest`
  directly: every test/build/preflight command was denied by the environment
  permission gate. The commit-time pre-commit hook still runs preflight, so a
  successful commit is the only preflight signal available this iteration.
- Working tree is otherwise clean this iteration: the `harness/`,
  `pnpm-lock.yaml`, and `specs/plan.md` edits noted in the earlier start-of-run
  snapshot were no longer present when this iteration staged its work. Only
  `frontend/src/calculator.test.ts`, `specs/frontend.md`, and
  `docs/PROJECT_STATUS.md` were staged this iteration.

## Blockers

- Test/build/preflight/gate commands are denied by the environment permission
  gate this iteration; only git and file edits succeed. A human must run
  `pnpm preflight` and `pnpm gate` to confirm the new test is green.
- `harness/cli.test.ts` is forbidden to agents. Direct `pnpm gate` is blocked
  until a human fixes or approves the harness setup status failures.
- No known frontend behavior blocker for this iteration.

## Next

- Human fix/approve the forbidden harness setup status issue.
- Then run `pnpm gate` and continue the next focused frontend spec item.
