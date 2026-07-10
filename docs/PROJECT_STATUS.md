> Handoff. Keep it short and current.

## State

- Branch: `main`; HEAD before this iteration: `c06cd9e`.
- This iteration separated result math UX: `Calculation used` now renders
  ordered substituted rows, while `Formula used` stays symbolic.
- `specs/frontend.md` was condensed to current frontend truth and marks the
  calculation/formula distinction complete.
- Raw calculator-reference HTML snippets were converted into valid distilled
  notes at the same paths.

## Checks

- Focused unit tests passed:
  `pnpm --dir frontend exec vitest run src/report.test.ts src/app.test.ts --config ../harness/vitest.config.js`.
- Focused browser suite passed:
  `pnpm --prefix frontend run test:e2e -- calculator.spec.ts` passed 186 tests.
- `pnpm preflight` passed after converting raw reference HTML and fixing one
  local JSDoc issue.
- Final `pnpm gate` is RED only on forbidden harness-owned
  `harness/cli.test.ts:798`; format, lint, style, html, typecheck,
  harnessTypes, schema, cruise, deadcode, spelling, workflow, sast, secrets,
  audit, build, e2e, and Lighthouse passed.

## Blockers

- `pnpm gate` fails on forbidden harness-owned code:
  `harness/cli.test.ts:798` expects the old `claude` preset, while the current
  preset has changed.
- This iteration cannot edit forbidden paths: `harness/`, `tests/harness/`,
  `.githooks/`, `.github/`, `pyproject.toml`, `AGENTS.md`, or `PROMPT.md`.

## Next

- Continue remaining visual polish in `specs/frontend.md`.
- Fix the harness-owned preset assertion, then rerun `pnpm gate`.
