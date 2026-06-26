# Frontend Launch Spec

PRIORITY 1

## Vision

Users open the Vite calculator first. FastAPI is the only backend/server path.

## Current State

- FastAPI serves the built `frontend/dist` SPA at `/` and mounts `/assets`.
- FastAPI app creation no longer depends on built assets being present; `/api/report`
  remains available before a frontend build, and `/assets` is mounted only when
  `frontend/dist/assets` exists.
- FastAPI app creation now accepts explicit frontend index and asset paths, so
  no-build fallback coverage does not mutate module globals.
- `/api/report` is served by the same FastAPI process.
- `src/web/page.py` remains only as a no-build fallback when `frontend/dist` is absent.
- WSGI is removed.
- Mocked and real-backend Playwright suites pass in this environment.
- `cd frontend && npm run build` passes.
- `uv run harness preflight` passes.
- `uv run pytest` and `uv run harness gate` are currently blocked by a
  human-owned harness preset change in forbidden paths; see
  `docs/PROJECT_STATUS.md`.

## Acceptance Signals

- `uv run pytest` passes after the harness-owned dirty change is resolved.
- `cd frontend && npm run build` passes.
- `cd frontend && npm run test:e2e` passes.
- `cd frontend && npm run test:e2e:real` passes.
- `uv run harness preflight` passes.
- `uv run harness gate` passes after the harness-owned dirty change is resolved.
- The launch URL serves the Vite UI after build.
- `/api/report` returns JSON from FastAPI.
- No WSGI app remains.

## If Browser Tests Fail

Run them outside the restricted agent sandbox first. If they still fail, record
the exact command and error in `docs/PROJECT_STATUS.md`.

## Non-goals

- No calculator math changes.
- No parser edge-case hunt.
- No design redesign unless needed to fix a launch bug.
- Leave `frontend/example_user_will_delete/` alone; the user will delete it once
  the frontend is done.
