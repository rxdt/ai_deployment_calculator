> Current launch handoff. Keep it short and current.

## Current State

- The active implementation spec is `specs/frontend.md`.
- Current branch is `main`, ahead 9 and behind 1 against `origin/main`.
- Advice-removal implementation commit is `f6acfbf`.
- Fallback no-JS control implementation is the latest commit on `main`.
- This pass keeps fallback QLoRA and MoE dependent controls submittable before
  JavaScript runs; the enhancement script still disables them when appropriate.
- Finished specs have been removed so agents do not select stale work.
- Vite frontend builds and calls `/api/report`.
- FastAPI backend serves `/api/report`.
- FastAPI `/` now serves the built `frontend/dist` SPA and mounts `/assets`; it
  falls back to the server-rendered no-JS page only when no build exists.
- FastAPI app creation is covered before frontend assets exist: `/api/report`
  still works, and missing `/assets` requests return 404 instead of breaking
  startup.
- FastAPI app creation now accepts explicit frontend index and asset paths; tests
  cover a configured build path and no-build fallback without monkeypatching
  module globals.
- The no-build fallback now lets plain HTML submissions choose QLoRA or MoE.
- The dense architecture option now renders as `Dense (Typical inference)` in
  both the Vite UI and the no-build fallback.
- WSGI removed: `src/web/app.py` and `tests/test_app.py` deleted. Its form HTML
  and `/api/report` behaviors are covered by `tests/test_server.py`. FastAPI is
  the only server path. README updated to match.
- Real-backend browser smoke passes: `frontend/tests/real-api.spec.ts` +
  `frontend/playwright.real-api.config.ts` + `npm run test:e2e:real`. No mocking;
  drives the built SPA against live uvicorn and asserts the backend's `48.4 GB`.
  Default `playwright.config.ts` `testIgnore`s it.
- Frontend logic is split into `frontend/src/app.ts` with `frontend/src/main.ts`
  as the mount-only bootstrap.
- Vitest coverage is enforced at 100% statements, branches, functions, and lines
  for `frontend/src/**/*.ts`.
- `frontend/ci.yml` mirrors `.github/workflows/ci.yml` for the frontend gate.
  It is not installed under `.github/` because workflow paths are protected.

## Next

1. Copy `frontend/ci.yml` to `.github/workflows/frontend-ci.yml` when protected
   workflow edits are allowed.
2. Human owner reviews remaining protected/unrelated working-tree edits,
   including `.githooks/pre-commit`, `docs/plan.md`, generated report HTML,
   and `frontend/example_user_will_delete/`.
3. Reconcile `main` with `origin/main` outside this no-merge/no-rebase loop,
   then push.

## Checks From This Pass

- `uv run pytest tests/test_frontend.py tests/test_page.py` - green, 24 passed.
- `cd frontend && npm run test:coverage` - green, 20 passed, 100% coverage.
- `uv run pytest tests/test_page.py` - green, 16 passed.
- `cd frontend && npm run gate` - green: build, 20 Vitest tests, 22 mocked
  Playwright tests, and 1 real-backend Playwright test.
- `harness preflight` - green.
- `harness gate` - green.
- This pass: `harness gate` - green.
- This pass: `harness preflight` - green.
- This pass: `git commit` - blocked after preflight by the already-modified
  protected `.githooks/pre-commit`: `line 12: $1: unbound variable`.
- Prior pass: `git commit` - green; pre-commit ran `harness gate`.
- `git push origin main` - fails after gate with non-fast-forward rejection
  because `main` is behind `origin/main`.
- This pass: selected the orchestration spec because launch behavior is already
  implemented and the remaining actionable gap was stale blocker/status text.

## Working Tree Notes

- Existing unrelated dirty paths remain outside this iteration's commit scope.
- Leave `frontend/example_user_will_delete/` alone. The user will delete it once
  the frontend is done.
