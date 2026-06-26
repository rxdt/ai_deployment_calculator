> Current launch handoff. Keep it short and current.

## Current State

- The active spec is `specs/orchestrate.md`.
- Current branch is `main`; the launch commit is staged but blocked by the
  protected pre-commit hook change.
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
   especially `.githooks/pre-commit`.
3. Commit and push the staged launch work after the hook is repaired.

## Checks From This Pass

- `cd frontend && npm run build` - green.
- `cd frontend && npm ci` - green.
- `cd frontend && npm run test:coverage` - green, 20 passed, 100% coverage.
- `cd frontend && npm run test:e2e` - green, 22 passed.
- `cd frontend && npm run test:e2e:real` - green, 1 passed against uvicorn.
- `cd frontend && npm run gate` - green.
- `uv run pytest tests/test_frontend.py` - green, 8 passed.
- `harness preflight` - green.
- `uv run pytest tests/test_server.py tests/test_api.py tests/test_frontend.py`
  - green, 22 passed.
- `uv run pytest` - green, 272 passed, 1 warning.
- `harness gate` - green.
- `git commit` - blocked after preflight passed. Git trace shows
  `.githooks/pre-commit` exits on `git diff --cached --quiet` while launch
  files are staged.

## Working Tree Notes

- Protected/unrelated dirty paths remain outside this iteration's commit scope.
  The staged set contains only allowed frontend/docs/test files.
- Leave `frontend/example_user_will_delete/` alone. The user will delete it once
  the frontend is done.
