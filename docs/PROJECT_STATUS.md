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

1. Run `cd frontend && npm run test:e2e:real` where TCP bind + Chromium launch are
   allowed. Both are blocked in this sandbox (see Blockers).

## Checks From This Pass

- `uv run pytest` - green, 270 passed.
- `uv run harness preflight` - green.
- `cd frontend && npm run build` - dist rebuilt and served at `/`.
- `npx playwright test --config playwright.real-api.config.ts --list` - lists the
  smoke; default config `--list` excludes it.

## Working Tree Notes

- Human owner is updating harness/protected paths in the same working tree.
- Leave `frontend/example_user_will_delete/` alone. The user will delete it once
  the frontend is done.

## Blockers

- Browser e2e is blocked in this macOS sandbox. The real-API smoke's uvicorn step
  fails before Chromium even launches: `npm run test:e2e:real` (CI=1) errors with
  `[Errno 1] error while attempting to bind on address ('127.0.0.1', 8001):
  [errno 1] operation not permitted` — the sandbox forbids TCP port binding. The
  prior Chromium Mach-port blocker still applies once a server can bind. Re-run
  where local permissions allow port binding and browser launch.
- `uv run harness gate` fails at the `security` step with an OCaml ca-certs error
  ("empty trust anchors" from the opentelemetry exporter) — an environment/TLS
  issue, not a code defect. preflight + full pytest are green.
  (Claude-frontend, specs/frontend.md)
