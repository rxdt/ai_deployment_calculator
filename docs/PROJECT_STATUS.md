> Current launch handoff. Keep it short and current.

## Current State

- The active spec is `specs/frontend.md`.
- Current branch is `main`; a local docs/status commit is ready, but push is
  blocked by the gate hook until the harness-owned dirty change is resolved.
- Finished specs have been removed so agents do not select stale work.
- Vite frontend builds and calls `/api/report`.
- FastAPI backend serves `/api/report`.
- FastAPI `/` now serves the built `frontend/dist` SPA and mounts `/assets`; it
  falls back to the server-rendered no-JS page only when no build exists.
- WSGI removed: `src/web/app.py` and `tests/test_app.py` deleted. Its form HTML
  and `/api/report` behaviors are covered by `tests/test_server.py`. FastAPI is
  the only server path. README updated to match.
- Real-backend browser smoke passes: `frontend/tests/real-api.spec.ts` +
  `frontend/playwright.real-api.config.ts` + `npm run test:e2e:real`. No mocking;
  drives the built SPA against live uvicorn and asserts the backend's `48.4 GB`.
  Default `playwright.config.ts` `testIgnore`s it.

## Next

1. Human owner resolves the dirty harness preset change in forbidden paths.
2. Re-run `uv run pytest` and `uv run harness gate`.

## Checks From This Pass

- `cd frontend && npm run build` - green.
- `cd frontend && npm run test:e2e` - green, 22 passed.
- `cd frontend && npm run test:e2e:real` - green, 1 passed against uvicorn.
- `uv run harness preflight` - green.
- `uv run pytest` - blocked by pre-existing forbidden-path harness change:
  `tests/harness/test_cli.py::test_agent_presets_are_frozen` disagrees with the
  dirty `harness/cli.py`.
- `uv run harness gate` - blocked by the same failing pytest assertion.

## Working Tree Notes

- Human owner is updating harness/protected paths in the same working tree.
- Leave `frontend/example_user_will_delete/` alone. The user will delete it once
  the frontend is done.

## Blockers

- `uv run pytest` and `uv run harness gate` are expected to stay blocked until
  the human-owned harness dirty change is resolved.
