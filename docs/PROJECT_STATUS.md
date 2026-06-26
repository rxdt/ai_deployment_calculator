> Current launch handoff. Keep it short and current.

## Current State

- The active spec is `specs/frontend.md`.
- Finished specs have been removed so agents do not select stale work.
- Vite frontend builds and calls `/api/report`.
- FastAPI backend serves `/api/report`.
- FastAPI `/` now serves the built `frontend/dist` SPA and mounts `/assets`; it
  falls back to the server-rendered no-JS page only when no build exists.
- WSGI removed: `src/web/app.py` and `tests/test_app.py` deleted. Its form HTML
  and `/api/report` behaviors are covered by `tests/test_server.py`. FastAPI is
  the only server path. README updated to match.
- Real-backend browser smoke added: `frontend/tests/real-api.spec.ts` +
  `frontend/playwright.real-api.config.ts` + `npm run test:e2e:real`. No mocking;
  drives the built SPA against live uvicorn and asserts the backend's `48.4 GB`.
  Default `playwright.config.ts` `testIgnore`s it. `--list` confirms it compiles.

## Next

1. Re-run `cd frontend && npm run test:e2e` and
   `cd frontend && npm run test:e2e:real` outside this macOS sandbox.

## Checks From This Pass

- `uv run pytest` - green, 270 passed.
- `uv run harness preflight` - green.
- `uv run harness gate` - blocked at `security` by an OCaml ca-certs
  environment error: empty trust anchors.
- `cd frontend && npm run build` - dist rebuilt and served at `/`.
- `uv run pytest tests/test_frontend.py tests/test_server.py` - green, 12 passed.
- `cd frontend && npm run test:e2e` - blocked in this sandbox; Chromium cannot
  register `org.chromium.Chromium.MachPortRendezvousServer` (permission denied).
- `cd frontend && npm run test:e2e:real` - uvicorn starts and serves, then hits
  the same Chromium Mach-port permission blocker.
- `npx playwright test --config playwright.real-api.config.ts --list` - lists the
  smoke; default config `--list` excludes it.

## Working Tree Notes

- Human owner is updating harness/protected paths in the same working tree.
- Leave `frontend/example_user_will_delete/` alone. The user will delete it once
  the frontend is done.

## Blockers

- Browser launch is blocked in this macOS sandbox by Chromium Mach-port
  registration permissions. Use repo-local `TMPDIR` and `UV_CACHE_DIR` to avoid
  filesystem cache blockers, then rerun outside the sandbox.
- `harness gate` reaches the security step, then fails before repo-specific
  results with `ca-certs: empty trust anchors`.
