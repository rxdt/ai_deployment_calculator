> Current handoff. Keep it short and current.

## Current State

- Current branch is `harness`; this docs pass started from `7ba352b`.
- The shipped app is a static Vite calculator. `CalculatorApp.loadReport`
  normalizes form state and renders local TypeScript `buildReport(state)`
  synchronously.
- `README.md` now describes only the shipped Vite UI: no Python/FastAPI backend,
  no `/api/report`, no host-RAM output, and no stale GGUF/A100 reproduction.
- `specs/backend.md` records the README directive as complete.
- Frontend source and protected paths were left untouched for this pass.

## Next

1. Keep README and backend-removal docs aligned with the Vite-only app.
2. Frontend: only the human VL pixel-proxy decision remains in
   `specs/frontend.md`.

## Checks From This Pass

- `git fetch origin` - green.
- `harness gate` - green.
- Docs-pass commit is on the `harness` branch; see git history for the hash.
- `git push` - failed because `harness` has no upstream branch; not retried
  because this pass was limited to plain `git push`.

## Working Tree Notes

- Existing unrelated dirty paths predate this pass; do not revert them.
- Stage only `README.md`, `specs/backend.md`, and `docs/PROJECT_STATUS.md` for
  this docs pass.
