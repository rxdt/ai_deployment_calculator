> Handoff. Keep it short and current.

## State

- Branch: `main`; HEAD before this iteration: `8682714`.
- This iteration removed the visible `Confidence` result and report payload
  field; first-glance results now stay limited to VRAM and recommended GPU.
- The workload selector now consistently uses the current public naming
  contract: `Model Family` plus lower-case workload option labels.
- `specs/frontend.md` marks the confidence-removal item complete.

## Checks

- Focused unit suites passed:
  `pnpm --dir frontend exec vitest run src/app.test.ts src/report.test.ts`
  and `pnpm --dir frontend exec vitest run src/calculator.test.ts`.
- Focused browser suite passed:
  `pnpm --prefix frontend run test:e2e -- calculator.spec.ts responsive.spec.ts`
  passed 174 tests.
- Preflight: `pnpm preflight` passed.
- Final gate: `pnpm gate` is RED only on forbidden harness-owned
  `harness/cli.test.ts:798`; format, lint, style, html, typecheck,
  harnessTypes, schema, cruise, deadcode, spelling, workflow, sast, secrets,
  audit, build, e2e, and Lighthouse passed.

## Blockers

- `PROMPT.md` has pre-existing forbidden-path edits and is left unstaged.
- `pnpm gate` fails on forbidden harness-owned code:
  `harness/cli.test.ts:798` expects the old `claude` preset, while the current
  preset has changed.
- This iteration cannot edit forbidden paths: `harness/`, `tests/harness/`,
  `.githooks/`, `.github/`, `pyproject.toml`, `AGENTS.md`, or `PROMPT.md`.

## Next

- Continue remaining visual-polish items in `specs/frontend.md`.
