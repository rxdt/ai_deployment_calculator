> Current handoff. Keep it short and current.

## Current State

- Current branch is `main`; this backend guardrail pass started after
  `git fetch origin`.
- The shipped app is a static Vite calculator. `CalculatorApp.loadReport`
  normalizes form state and renders local TypeScript `buildReport(state)`
  synchronously.
- `README.md` now describes only the shipped Vite UI: no Python/FastAPI backend,
  no `/api/report`, no host-RAM output, and no stale GGUF/A100 reproduction.
- `specs/backend.md` records the README directive as complete.
- `frontend/src/app.test.ts` now asserts default render, form submit, and
  adaptive rerender paths do not call `fetch`, so a revived report-service path
  fails frontend tests.

## Next

1. Keep README, tests, and backend-removal docs aligned with the Vite-only app.
2. Frontend: only the human VL pixel-proxy decision remains in
   `specs/frontend.md`.

## Checks From This Pass

- `git fetch origin` - green.
- `npm --prefix frontend run test -- --run src/app.test.ts` - green.
- `npm --prefix frontend run typecheck` - green after strict cast fix.
- `npm --prefix frontend run gate` - green.
- `harness preflight` - green after staging the scoped files.
- Initial `git push` - rejected by pre-push gate on strict test casts in
  `frontend/src/app.test.ts`; casts were corrected.
- Commit - local on `main`.
- `git push` - retry pending after verification.

## Working Tree Notes

- Stage only `frontend/src/app.test.ts`, `specs/backend.md`, and
  `docs/PROJECT_STATUS.md` for this backend guardrail pass.
