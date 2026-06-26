# Frontend Launch Spec

PRIORITY 1

## Vision

Users open the Vite calculator first. FastAPI is the only backend/server path.

## Current State

- FastAPI serves the built `frontend/dist` SPA at `/` and mounts `/assets`.
- `/api/report` is served by the same FastAPI process.
- `src/web/page.py` remains only as a no-build fallback when `frontend/dist` is absent.
- WSGI is removed.
- Mocked and real-backend Playwright suites are wired; this sandbox blocks
  Chromium Mach-port registration, so rerun them outside the sandbox.
- `uv run pytest` and `uv run harness preflight` pass.
- `uv run harness gate` is blocked here by an external ca-certs security-step
  environment error; see `docs/PROJECT_STATUS.md`.

## Acceptance Signals

- `uv run pytest` passes.
- `cd frontend && npm run build` passes.
- `cd frontend && npm run test:e2e` passes for frontend changes, or the exact
  browser launch blocker is documented.
- `cd frontend && npm run test:e2e:real` passes for launch-path changes, or the
  exact browser launch blocker is documented.
- `uv run harness preflight` passes.
- `uv run harness gate` passes or an external blocker is documented.
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
