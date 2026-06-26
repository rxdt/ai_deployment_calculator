> Current launch handoff. Keep it short and current.

## Current State

- The active spec is `specs/frontend.md`.
- Finished specs have been removed so agents do not select stale work.
- Vite frontend builds and calls `/api/report`.
- FastAPI backend serves `/api/report`.
- FastAPI `/` now serves the built `frontend/dist` SPA and mounts `/assets`; it
  falls back to the server-rendered no-JS page only when no build exists.
- WSGI still exists and should be removed once FastAPI covers launch.

## Next

1. Remove WSGI: delete `src/web/app.py` and replace/remove `tests/test_app.py`.
2. Run one real browser smoke against the real API. If Chromium is blocked,
   record the exact command and error.
3. Update README with final launch commands and checks.

## Checks From This Pass

- `uv run pytest` - green, 272 passed.
- `uv run harness preflight` - green.
- `cd frontend && npm run build` - dist present and served at `/`.
- `uv run ruff check` / `uv run pyright` - clean on changed files.

## Working Tree Notes

- Human owner is updating harness/protected paths in the same working tree.
- Leave `frontend/example_user_will_delete/` alone. The user will delete it once
  the frontend is done.

## Blockers

- Browser e2e has previously been blocked in this macOS sandbox by Chromium Mach
  port permission errors. Re-test when local permissions allow browser launch.
- `uv run harness gate` fails at the `security` step with an OCaml ca-certs error
  ("empty trust anchors" from the opentelemetry exporter) — an environment/TLS
  issue, not a code defect. preflight + full pytest are green.
  (Claude-frontend, specs/frontend.md)
