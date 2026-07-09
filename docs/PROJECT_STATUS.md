> Handoff. Keep it short and current.

## State

- Branch: `main`; previous HEAD before this iteration:
  `ee45c69 Enforce numeric input bounds`.
- Static Vite + TypeScript calculator; frontend calculations and report
  rendering remain the source of truth.
- This iteration completed the output hierarchy item:
  - Hero cards now show only `Estimated VRAM Required`, the short usable-VRAM
    line, and `Recommended GPU Class`.
  - `Estimate confidence` remains visible, but is demoted outside the hero cards.
  - App tests pin that confidence is outside collapsed details and outside `.hero`.

## Checks

- Focused unit test:
  `pnpm --dir frontend exec vitest run src/app.test.ts --config ../harness/vitest.config.js`
  passed: 51 tests.
- Preflight: `pnpm preflight` passed.
- Final gate: `pnpm gate` ran to completion. Format, eslint, style, html,
  typecheck, harnessTypes, schema, cruise, deadcode, spelling, workflow, sast,
  secrets, audit, build, e2e, and Lighthouse passed. Coverage failed only on
  the forbidden harness preset assertion listed below.

## Blockers

- Pre-existing forbidden edits remain untouched:
  `PROMPT.md`, `harness/cli.ts`, `harness/gate.ts`, `harness/gate.test.ts`.
- `pnpm gate` remains RED on forbidden human-owned harness WIP:
  `harness/cli.ts` changed the `AGENTS.claude` preset while
  `harness/cli.test.ts:798` still pins the old preset. Both files are forbidden
  to agents.
- Pre-existing agent-editable spec WIP remains in `specs/frontend.md` and
  `specs/plan.md`; this iteration only updated the output hierarchy item in
  `specs/frontend.md`.

## Next

- Owner reconciles the forbidden harness preset mismatch.
- After that, rerun `pnpm gate`.
