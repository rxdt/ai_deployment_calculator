> Current handoff. Keep it short and current.

## Current State

- The active implementation spec for this pass is `specs/frontend.md`.
- Current branch is `main`; `git fetch origin` completed and local commits
  remain ahead of `origin/main`.
- The app is a static Vite calculator. `CalculatorApp.loadReport` normalizes
  form state and renders local TypeScript `buildReport(state)` synchronously.
- The calculator split is resolved through `frontend/src/calculator.ts` as the
  public barrel over `calculator-core.ts` and `workload-memory.ts`.
- `frontend/src/legacy-approximations.test.ts` was deleted and must stay gone.
- Frontend logic is split into focused `app`, `render`, `state`, `validation`,
  `controls`, `types`, `calculator`, `hardware`, and `report` modules, with
  `frontend/src/main.ts` as the mount-only bootstrap.
- Vitest coverage is enforced at 100% statements, branches, functions, and lines
  for `frontend/src/**/*.ts`.
- Manual `npm --prefix frontend run gate` runs frontend checks, JS harness
  self-tests, and then `.venv/bin/harness gate` so Python issues appear before
  `git push`.

## Next

1. Keep frontend parity green; do not reintroduce backend report-service
   calculations or legacy approximation tests.
2. Human owner reviews unrelated dirty files that predate this pass:
   `PROMPT.md`, `README.md`, and `frontend/harness/gate.test.ts`.
3. Push current branch when the pre-push hook allows it.

## Checks From This Pass

- `git fetch origin` - green; `main` had local commits ahead of `origin/main`
  before this pass.
- `npm --prefix frontend run build` - green.
- `npm --prefix frontend run test:coverage` - green at 100%.
- `npm --prefix frontend run test:e2e` - green.
- `npm --prefix frontend run gate` - green.
- `.venv/bin/harness gate` - green.
- `harness preflight` - green.
- `git push` - pending.

## Working Tree Notes

- Existing unrelated dirty paths predate this pass; do not revert user-owned
  files.
- Current branch has local commits that are not pushed because plain `git push`
  was previously rejected by the hook failure recorded above.
- Leave `frontend/example_user_will_delete/` alone. The user will delete it once
  the frontend is done.
