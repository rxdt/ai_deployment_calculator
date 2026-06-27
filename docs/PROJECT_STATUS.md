> Current handoff. Keep it short and current.

## Current State

- The active implementation spec for this pass is `specs/frontend.md`.
- Current branch is `main`; this pass is pending commit and push.
- The app is a static Vite calculator. `CalculatorApp.loadReport` normalizes
  form state and renders local TypeScript `buildReport(state)` synchronously.
- The calculator split is resolved through `frontend/src/calculator.ts` as the
  public barrel over `calculator-core.ts` and `workload-memory.ts`.
- Frontend parity gaps #1, #2, #3, and #4 are closed: Local/Edge inference now
  applies `Weight_Overhead`, text generation includes decoder scratch memory,
  vision-language uses vision architecture or the plan pixel proxy, and
  tiny-model training activations use the plan formula without a special case.
- The remaining frontend minor parity items are closed: overflow cloud cost now
  scales by required 320 GB GPU count, local-file runtime distinction dead code
  is removed, and displayed `0.0 GB` breakdown rows are hidden.
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

1. Frontend: only the human VL pixel-proxy decision remains in
   `specs/frontend.md`.
2. Docs: update stale `README.md` feature list/repro steps (see `specs/backend.md`
   TODO) to match shipped Vite-only outputs.
3. Backend removal verified clean by code review; keep it green.
4. Keep frontend parity green; do not reintroduce report-service calculations or
   legacy approximation tests.

## Checks From This Pass

- `git fetch origin` - green.
- `npm --prefix frontend run test:coverage -- src/hardware.test.ts
  src/calculator.test.ts src/report.test.ts` - selected tests green; package-wide
  coverage threshold fails for this focused run.
- `npm --prefix frontend run build` - green.
- `npm --prefix frontend run test:coverage` - green at 100%.
- `npm --prefix frontend run test:e2e` - first run hit an axe navigation race;
  rerun green.
- `npm --prefix frontend run gate` - first run fixed formatting/lint, second hit
  the axe navigation race, rerun green including `.venv/bin/harness gate`.
- `git push` - pending.

## Working Tree Notes

- Existing unrelated dirty paths predate this pass; do not revert user-owned
  files.
- Current branch is `main`; this pass is pending commit and push.
- Leave `frontend/example_user_will_delete/` alone. The user will delete it once
  the frontend is done.
