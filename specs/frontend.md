# Frontend Launch Spec

PRIORITY 1

## Vision

Users open the Vite calculator first. FastAPI is the only backend/server path.

## Remaining Items

1. Run the real-backend Playwright smoke (`cd frontend && npm run test:e2e:real`) in
   an environment that allows TCP port binding and Chromium launch. In this macOS
   sandbox both are blocked (see Blockers); the test, config, and script exist.

Done: a no-mock browser smoke now exists. `frontend/tests/real-api.spec.ts` drives
the built SPA against a live uvicorn process (built `dist` + real `/api/report` from
`web.server:app`), wired by `frontend/playwright.real-api.config.ts` and run via the
`test:e2e:real` script. It asserts the rendered total matches the backend's computed
`48.4 GB` for the same query as `tests/test_server.py`. The default
`playwright.config.ts` `testIgnore`s this spec so the mocked suite is unaffected.

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
