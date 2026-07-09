> Handoff. Keep it short and current.

## State

- Branch: `main`; previous HEAD before this iteration:
  `43cd88b`.
- This iteration added browser parity coverage for canonical smoke scenarios:
  - `frontend/tests/calculator.spec.ts` now enters 47B MoE inference, 8B QLoRA
    2%, 7B full training, and 104B exact local GGUF through real controls.
  - The tests pin visible totals, GPU class, minimum VRAM, breakdown rows, and
    assumption rows across Playwright projects.
  - `specs/frontend.md` marks that browser-entered smoke coverage complete.
- No calculator source behavior changed.

## Checks

- Focused browser suite:
  `pnpm --prefix frontend run test:e2e -- calculator.spec.ts` passed:
  156 tests.
- Preflight: `pnpm preflight` passed.
- Final gate: `pnpm gate` completed format, eslint, style, html, typecheck,
  harnessTypes, schema, cruise, deadcode, spelling, workflow, sast, secrets,
  audit, build, e2e, and Lighthouse. It is RED only on the forbidden harness
  preset assertion listed below.

## Blockers

- Pre-existing forbidden edits remain untouched:
  `PROMPT.md`, `harness/cli.ts`, `harness/gate.ts`, `harness/gate.test.ts`.
- `pnpm gate` remains RED on forbidden human-owned harness WIP:
  `harness/cli.ts` changed the `AGENTS.claude` preset while
  `harness/cli.test.ts:798` still pins the old preset. Both files are forbidden
  to agents.
- Pre-existing agent-editable spec WIP remains in `specs/frontend.md` and
  `specs/plan.md`; this iteration only updated the browser smoke-coverage item
  in `specs/frontend.md`.

## Next

- Owner reconciles the forbidden harness preset mismatch, then rerun
  `pnpm gate`.
- Continue remaining shippability gaps in `specs/frontend.md`, starting with
  broader visual polish and any remaining canonical-case browser coverage.
