> Current launch handoff. Keep it short and current.

## Current State

- The active spec is `specs/frontend.md`.
- Finished specs have been removed so agents do not select stale work.
- Vite frontend builds and calls `/api/report`.
- FastAPI backend serves `/api/report`.
- FastAPI `/` still serves the static fallback page, not the built Vite app.
- WSGI still exists and should be removed once FastAPI covers launch.

## Next

1. Serve `frontend/dist` from FastAPI when the build exists.
2. Keep `/api/report` working from the same FastAPI process.
3. Remove WSGI: delete `src/web/app.py` and replace/remove `tests/test_app.py`.
4. Keep `src/web/page.py` only if FastAPI needs a no-build fallback.
5. Run one real browser smoke against the real API. If Chromium is blocked,
   record the exact command and error.
6. Update README and this file with final launch commands and checks.

## Checks From This Pass

- `pytest tests/test_deployment_plan.py tests/test_presenter.py tests/test_report.py tests/test_view.py` - green, 97 passed.
- `cd frontend && npm run build` - green.
- Full harness/gate checks were not run because the human owner is updating the
  harness/protected paths.

## Working Tree Notes

- Human owner is updating harness/protected paths in the same working tree.
- Leave `frontend/example_user_will_delete/` alone. The user will delete it once
  the frontend is done.

## Blockers

- Browser e2e has previously been blocked in this macOS sandbox by Chromium Mach
  port permission errors. Re-test when local permissions allow browser launch.
