# Frontend Launch Spec

PRIORITY 1

## Vision

Users open the Vite calculator first. FastAPI is the only backend/server path.

## Remaining Items

1. Build `frontend/` and serve `frontend/dist` from FastAPI when it exists.
2. Keep `/api/report` available from FastAPI.
3. Remove WSGI if it still exists: delete `src/web/app.py` and replace/remove
   `tests/test_app.py` so no agent keeps maintaining a second server.
4. Keep `src/web/page.py` only if FastAPI still needs a no-build fallback.
5. Add or run one Playwright browser smoke that uses the real backend API, not a mocked
   `/api/report`.
6. Update README with concise human/user instructions for manual start and test.
7. Update `docs/PROJECT_STATUS.md` with checks, blocker state, and next step.

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
