> Current handoff. Keep it short and current.

## Current State

- Current branch is `harness`; this backend guardrail pass started after
  `git fetch origin`.
- The shipped app is a static Vite calculator. `CalculatorApp.loadReport`
  normalizes form state and renders local TypeScript `buildReport(state)`
  synchronously.
- `README.md` now describes only the shipped Vite UI: no Python/FastAPI backend,
  no `/api/report`, no host-RAM output, and no stale GGUF/A100 reproduction.
- `specs/backend.md` records the README directive as complete.
- `frontend/src/app.test.ts` now asserts default app rendering does not call
  `fetch`, so a revived report-service path fails frontend tests.
- Protected paths were already dirty before this pass and were left untouched.

## Next

1. Keep README, tests, and backend-removal docs aligned with the Vite-only app.
2. Frontend: only the human VL pixel-proxy decision remains in
   `specs/frontend.md`.

## Checks From This Pass

- `git fetch origin` - green.
- `npm --prefix frontend run test -- --run src/app.test.ts` - green.
- `harness preflight` - green.
- Commit - local on `harness`.
- `git push` - failed because `harness` has no upstream branch; not retried.

## Working Tree Notes

- Existing unrelated dirty paths predate this pass; do not revert them.
- Stage only `frontend/src/app.test.ts`, `specs/backend.md`, and
  `docs/PROJECT_STATUS.md` for this backend guardrail pass.
