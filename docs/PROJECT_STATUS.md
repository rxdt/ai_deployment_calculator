> Current launch handoff. Keep it short and current.

## Current State

- The active implementation spec is `specs/frontend.md`.
- Current branch is `main`, aligned with `origin/main` after fetch before this
  pass's status-only commit.
- Advice-removal implementation is in current history.
- Fallback QLoRA and MoE dependent controls are submittable before JavaScript
  runs; the enhancement script still disables them when appropriate.
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
   including `.githooks/pre-push`, `PROMPT.md`, generated report HTML, and
   `frontend/example_user_will_delete/`.

## Checks From This Pass

- `git fetch origin` - green; `main` was aligned with `origin/main`.
- `harness gate` - green.
- `harness preflight` - green.
- Selected the orchestration spec because launch behavior is already implemented
  and the actionable gap was stale blocker/status text.

## Working Tree Notes

- Existing unrelated dirty paths remain outside this iteration's commit scope.
- Leave `frontend/example_user_will_delete/` alone. The user will delete it once
  the frontend is done.
