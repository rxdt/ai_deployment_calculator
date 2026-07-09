> Handoff. Keep it short and current.

## State

- Current branch: `main`.
- Static Vite + TypeScript calculator; frontend calculations and report
  rendering are the source of truth.
- Default output contract: hero glance first, four collapsed result detail
  panels, no `Accuracy` or `Your GPU Fit`, and default inference warnings
  hidden.
- The form has one visible action: submit button `Reset`; submit prevents
  navigation, zeroes inputs, and renders the empty estimate.
- Hidden adaptive controls disable descendants; hidden MoE selection is cleared
  before returning to MoE-applicable families.
- Expanded `Advanced assumptions` now opens as a compact anchored panel, and
  Playwright pins no page overflow on desktop/mobile viewports.
- `specs/frontend.md` marks the expanded advanced one-viewport contract and
  Playwright coverage complete.
- Result detail speed labels now include the rendered workload unit, e.g.
  `Estimated Speed (tokens/sec)`, `images/min`, `clips/min`, `rows/sec`, or
  `audio tokens/sec`.
- `specs/plan.md` marks the workload-adaptive speed label complete.
- `Known Model File Size` now overrides QLoRA base model memory, matching the
  documented resident-file-size override contract.

## Commands

- Focused app/report unit tests:
  `pnpm --dir frontend exec vitest run src/app.test.ts src/report.test.ts`
- Focused calculator unit tests:
  `pnpm --dir frontend exec vitest run src/calculator.test.ts`
- Full unit + coverage: `pnpm --prefix frontend run test:coverage`
- Build: `pnpm --prefix frontend run build`
- Preview: `pnpm --prefix frontend run preview -- --port 5174`
- Playwright:
  `pnpm --dir frontend exec playwright test --config ../harness/playwright.config.js`
- Focused responsive Playwright:
  `pnpm --dir frontend exec playwright test --config ../harness/playwright.config.js frontend/tests/responsive.spec.ts`
- Lighthouse:
  `./harness/node_modules/.bin/lhci autorun --config harness/lighthouserc.cjs`
- Preflight: `pnpm preflight`
- Gate: `pnpm gate`

## Checks

- Focused app tests pass: `pnpm --dir frontend exec vitest run src/app.test.ts`.
- Focused calculator/report tests pass:
  `pnpm --dir frontend exec vitest run src/calculator.test.ts src/report.test.ts`.
- Focused calculator tests pass:
  `pnpm --dir frontend exec vitest run src/calculator.test.ts`.
- `pnpm preflight` passes after staging this iteration's scoped files.
- Focused responsive Playwright passes: 48 tests.
- `pnpm gate` passes format, eslint, style, html, typecheck, harness types,
  schema, dependency-cruiser, deadcode, spelling, workflow lint, secrets,
  audit, build, e2e, and Lighthouse. `semgrep` is not installed and is skipped.
- `pnpm gate` fails in forbidden harness coverage tests:
  `harness/cli.test.ts` has six setup cases expecting status `0`, `1`, or `7`
  but receiving status `2`.

## Blockers

- No current frontend behavior blocker.
- `harness/cli.test.ts` is forbidden to agents, so the gate coverage failure
  needs a human harness fix or approval.
- Existing unstaged forbidden edits remain in `harness/cli.ts` and
  `harness/cli.test.ts`; agents must not stage or alter them.

## Next

- Continue remaining frontend styling checklist only after HTML/TypeScript scope
  stays green.
