# Plan

> Launch handoff. Agents should work only the open launch path below.

## Goal

Launch the Vite AI deployment calculator with a Python API backend.

## Only Remaining Work

1. Serve the built Vite app from FastAPI when `frontend/dist` exists.
2. Keep `/api/report` working from FastAPI.
3. Remove the WSGI entrypoint and its tests if it still exists. The app should
   have one backend launch path: FastAPI.
4. Keep the static fallback page only if it is still needed as a no-build
   FastAPI fallback; do not keep a second WSGI server for it.
5. Run one real browser smoke against the real API. If the agent sandbox blocks
   localhost or Chromium, rerun the same command unsandboxed.
6. Update README and `docs/PROJECT_STATUS.md` with the truthful launch command, checks run, and blockers.


## Active Spec

- Work from `specs/frontend.md`.
- It is the only remaining spec. Finished specs have been removed so agents do
  not keep selecting stale work.

## Do Not Do

- Do not add more calculator math, hardware catalog, parser edge cases, or
  mocked Playwright tests.
- Leave `frontend/example_user_will_delete/` alone. The user will delete it once
  the frontend is done.
- Do not preserve WSGI for compatibility; remove it once FastAPI covers launch.

## Required Checks

```sh
cd frontend && npm run build
cd frontend && npm run test:e2e
harness preflight
harness gate
```

If Playwright still fails outside the sandbox, record the exact command and
error in `docs/PROJECT_STATUS.md`.
