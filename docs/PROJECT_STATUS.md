> Current handoff. Keep it short and current.

## Current State

- Current branch is `main`; this pass fetched `origin` before work.
- The shipped app is a static Vite calculator. `CalculatorApp.loadReport`
  normalizes form state and renders local TypeScript `buildReport(state)`
  synchronously.
- `README.md` now describes only the shipped Vite UI: no Python/FastAPI backend,
  no `/api/report`, no host-RAM output, and no stale GGUF/A100 reproduction.
- `frontend/src/app.test.ts` now asserts mounted direct query loading, default
  render, form submit, and adaptive rerender paths do not call `fetch`.

## Next

1. Keep README, tests, and backend-removal docs aligned with the Vite-only app.
2. Frontend: only the human VL pixel-proxy decision remains in
   `specs/frontend.md`.

## Checks From This Pass

- `git fetch origin` - green.
- `rg` backend-removal sweep - no Python app, report-service route, or
  frontend `fetch(` source found.
- `npm --prefix frontend run test -- --run src/app.test.ts` - green.
- `harness preflight` - green after staging scoped files.

## Working Tree Notes

- Stage only `frontend/src/app.test.ts`, `specs/backend.md`, and
  `docs/PROJECT_STATUS.md` for this backend guardrail pass.
- Pre-existing unstaged changes are present in `PROMPT.md`, `README.md`,
  `specs/frontend.md`, and `frontend/test-results/`; do not include them.
