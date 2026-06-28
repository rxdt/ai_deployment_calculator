> Current handoff. Keep it short and current.

## Current State

- Current branch is `main`; this pass fetched `origin` before work.
- The shipped app is a static Vite calculator. `CalculatorApp.loadReport`
  normalizes form state and renders local TypeScript `buildReport(state)`
  synchronously.
- UI polish pass is implemented in `frontend/src/render.ts` and
  `frontend/src/styles.css` only: grouped inputs, compact/collapsed secondary
  outputs, desktop no-scroll layout, and mobile no-horizontal-overflow layout.

## Next

1. Keep README, tests, and backend-removal docs aligned with the Vite-only app.
2. Frontend: only the human VL pixel-proxy decision remains.

## Checks From This Pass

- `git fetch origin` - green.
- Initial `harness preflight` reported empty commit because nothing was staged.
- `npm --prefix frontend run test -- --run src/app.test.ts` - green.
- `npm --prefix frontend run build` - green.
- `npm --prefix frontend run test:e2e` - green, including axe.
- Playwright viewport probe - 1440x900 no document scroll; 390px no horizontal
  overflow.
- `npm --prefix frontend run preflight` - green.
- `npm --prefix frontend run test:coverage` - green, 100%.
- `npm --prefix frontend run gate` - green.

## Working Tree Notes

- Stage only `frontend/src/render.ts`, `frontend/src/styles.css`, and this
  status file for the UI pass.
- Pre-existing unstaged changes remain in `PROMPT.md`, `README.md`,
  `docs/plan.md`, `specs/backend.md`, `specs/frontend.md`,
  `specs/orchestrate.md`, `frontend/test-results/`, `specs/fp_codex_design.md`,
  and `specs/plan.md`; do not include them.
