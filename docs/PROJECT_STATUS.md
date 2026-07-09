> Handoff. Keep it short and current.

## State

- Branch: `main`; HEAD before this iteration: `43a6a57`.
- This iteration completed the output confidence wording cleanup:
  - The visible label is now `Confidence`.
  - The old confidence heading wording is gone from frontend source and app view.
  - Unit and browser tests pin the label while keeping `Estimated` / `Rough`
    values visible outside collapsed detail panels.
- `specs/frontend.md` and `specs/plan.md` mark the confidence output item complete.

## Checks

- Focused unit suite passed:
  `pnpm --dir frontend exec vitest run src/app.test.ts src/confidence.test.ts`.
- Focused browser suite passed:
  `pnpm --prefix frontend run test:e2e -- calculator.spec.ts` passed 168 tests.
- Preflight: `pnpm preflight` passed.
- Final gate: `pnpm gate` is RED only on `harness/cli.test.ts:798`; format,
  lint, style, html, typecheck, harnessTypes, schema, cruise, deadcode,
  spelling, workflow, sast, secrets, audit, build, e2e, and Lighthouse passed.

## Blockers

- `pnpm gate` fails on forbidden harness-owned code: `harness/cli.test.ts:798`
  expects the old `claude` preset, while the current preset has changed.
- This iteration cannot edit forbidden paths: `harness/`, `tests/harness/`,
  `.githooks/`, `.github/`, `pyproject.toml`, `AGENTS.md`, or `PROMPT.md`.

## Next

- Owner reconciles the forbidden harness preset mismatch, then rerun
  `pnpm gate`.
- Continue remaining visual-polish items in `specs/frontend.md`.
