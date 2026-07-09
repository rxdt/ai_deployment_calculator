> Handoff. Keep it short and current.

## State

- Branch: `main`; HEAD before this iteration: `8b44a1b`.
- This iteration tightened form behavior for release readiness:
  - Inference workload size is now labeled `Concurrent Batch Requests` in the
    form, responsive smoke tests, browser report assertions, and assumptions.
  - `QLoRA fine-tuning` still forces `Precision` to `4-bit` and
    `Runtime Profile` to `Local / Edge`.
  - Choosing a non-`4-bit` precision while in QLoRA now resets numeric inputs and
    returns `Execution Mode` to `Inference`.
- `specs/frontend.md` marks the verified checkbox, KV precision, workload-label,
  and QLoRA precision-switching items complete.

## Checks

- Focused unit suites passed:
  `pnpm --dir frontend exec vitest run src/app.test.ts src/report.test.ts` and
  `pnpm --dir frontend exec vitest run src/calculator.test.ts src/state.test.ts`.
- Focused browser suites passed:
  `pnpm --prefix frontend run test:e2e -- calculator.spec.ts responsive.spec.ts`
  passed 168 tests.
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
