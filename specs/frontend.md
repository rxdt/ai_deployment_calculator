# Frontend Launch Spec

PRIORITY 1

## Vision

Users open the Vite calculator first. FastAPI is the only backend/server path.

## Remaining Items

1. Add or run one Playwright browser smoke that uses the real backend API, not a mocked
   `/api/report`.

Done: WSGI is gone (`src/web/app.py` and `tests/test_app.py` deleted); its form
HTML and `/api/report` behaviors are now covered by `tests/test_server.py`.
FastAPI serves the built `frontend/dist` SPA at `/` and mounts `/assets`,
falling back to `src/web/page.py` (no-JS render) only when no build exists.
`/api/report` stays on the same process. README has the manual start/test steps.

## Acceptance Signals

- `uv run pytest` passes.
- `cd frontend && npm run build` passes.
- `cd frontend && npm run test:e2e` passes for frontend changes, or the exact
  browser launch blocker is documented.
- `uv run harness preflight` passes.
- `uv run harness gate` passes or an external blocker is documented.
- The launch URL serves the Vite UI after build.
- `/api/report` returns JSON from the same FastAPI process.
- No WSGI app remains.
- Browser e2e either passes against the real API or has a documented browser
  permission blocker.

## Non-goals

- No calculator math changes.
- No parser edge-case hunt.
- No design redesign unless needed to fix a launch bug.
- Leave `frontend/example_user_will_delete/` alone; the user will delete it once
  the frontend is done.
