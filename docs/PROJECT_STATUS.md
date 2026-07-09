> Handoff. Keep it short and current.

## State

- Branch: `main`; previous HEAD before this iteration:
  `de45ff4 Record the verified full-gate stage-by-stage result`.
- Static Vite + TypeScript calculator; frontend calculations and report
  rendering remain the source of truth.
- This iteration completed the frontend numeric input contract:
  - Live numeric input removes letters, negatives, and exponent notation.
  - Decimal-mode fields keep at most one decimal digit.
  - Integer-mode fields clamp at `99999999`; decimal-mode global clamp is
    `99999999.9`.
  - Per-field caps still win for advanced controls (`1` for GPU resident
    fraction, `100` for LoRA trainable percent).
- The sanitizer now lives in `frontend/src/input-sanitizer.ts`; URL/direct state
  normalization mirrors the same one-decimal global cap.

## Checks

- Focused unit tests:
  `pnpm --dir frontend exec vitest run src/app.test.ts src/state.test.ts --config ../harness/vitest.config.js`
  passed: 66 tests.
- Preflight: `pnpm preflight` passed.
- Frontend coverage: `pnpm --prefix frontend run test:coverage` passed: 193
  tests, 100% statements/branches/functions/lines.
- Final gate: `pnpm gate` ran to completion. Format, eslint, style, html,
  typecheck, harnessTypes, schema, cruise, deadcode, spelling, workflow, sast,
  secrets, audit, build, e2e, and lighthouse passed. Coverage failed only on the
  forbidden harness preset assertion listed below.

## Blockers

- `pnpm gate` is expected to remain RED on forbidden human-owned harness WIP:
  `harness/cli.ts` changed the `AGENTS.claude` preset while
  `harness/cli.test.ts` still pins the old preset. Both files are forbidden to
  agents, so this iteration leaves them untouched.
- Other pre-existing unstaged forbidden edits remain untouched:
  `PROMPT.md`, `harness/cli.ts`, `harness/gate.ts`, `harness/gate.test.ts`.
- Pre-existing agent-editable spec WIP remains in `specs/frontend.md` and
  `specs/plan.md`; this iteration only updated the numeric input item in
  `specs/frontend.md`.

## Next

- Owner reconciles the forbidden harness preset mismatch.
- After that, run `pnpm gate` and address any frontend-owned failures.
