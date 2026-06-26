> Current launch handoff. Keep it short and current.

## Current State

- The active implementation spec is `specs/frontend.md`.
- Current branch is `main`; `git fetch origin` completed before this pass and
  found one existing local commit ahead of `origin/main`.
- Advice-removal implementation is in current history.
- Fallback QLoRA and MoE dependent controls are submittable before JavaScript
  runs; the enhancement script still disables them when appropriate.
- Finished specs have been removed so agents do not select stale work.
- Vite frontend builds and calls `/api/report`.
- FastAPI backend serves `/api/report`.
- FastAPI `/` now serves the built `frontend/dist` SPA and mounts `/assets`; it
  falls back to the server-rendered no-JS page only when no build exists.
- FastAPI app creation is covered before frontend assets exist: `/api/report`
  still works, and missing `/assets` requests return 404 instead of breaking
  startup.
- FastAPI app creation now accepts explicit frontend index and asset paths; tests
  cover a configured build path, configured asset path, and no-build fallback
  without monkeypatching module globals.
- The no-build fallback now lets plain HTML submissions choose QLoRA or MoE.
- The dense architecture option now renders as `Dense (Typical inference)` in
  both the Vite UI and the no-build fallback.
- The training checkbox now renders as `GPUs are for model training` in both the
  Vite UI and the no-build fallback; the `trained` query field is unchanged.
- WSGI removed: `src/web/app.py` and `tests/test_app.py` deleted. Its form HTML
  and `/api/report` behaviors are covered by `tests/test_server.py`. FastAPI is
  the only server path. README updated to match.
- Real-backend browser smoke passes: `frontend/tests/real-api.spec.ts` +
  `frontend/playwright.real-api.config.ts` + `npm run test:e2e:real`. No mocking;
  drives the built SPA against live uvicorn and asserts the backend's `48.4 GB`.
  Default `playwright.config.ts` `testIgnore`s it.
- Frontend logic is split into focused `app`, `render`, `state`, `validation`,
  `controls`, and `types` modules, with `frontend/src/main.ts` as the mount-only
  bootstrap.
- Vitest coverage is enforced at 100% statements, branches, functions, and lines
  for `frontend/src/**/*.ts`.
- `frontend/ci.yml` mirrors `.github/workflows/ci.yml` for the frontend gate.
  It is not installed under `.github/` because workflow paths are protected.

## Next

1. Copy `frontend/ci.yml` to `.github/workflows/frontend-ci.yml` when protected
   workflow edits are allowed.
2. Human owner reviews remaining protected/unrelated working-tree edits,
   including `.githooks/pre-push`, `PROMPT.md`, generated report HTML, and
   `frontend/example_user_will_delete/`.

## Checks From This Pass

- `git fetch origin` - green; `main` was ahead of `origin/main` by one existing
  commit before this pass.
- `pytest tests/test_page.py tests/test_frontend.py tests/test_presenter.py -q`
  - green.
- `npm --prefix frontend run test:coverage` - green at 100%.
- `npm --prefix frontend run lint` - green; ESLint reports one existing
  `security/detect-object-injection` warning in validation.
- `npm --prefix frontend run build` - green.
- `npm --prefix frontend run test:e2e` - green.
- `env -u RALPH_LOOP harness gate` - green. The shell exports `RALPH_LOOP=1`;
  unsetting it lets harness integration tests simulate their non-loop commit.
- `harness preflight` - green after staging; it removed `docs/plan.md` from the
  staged set as protected.
- `npm --prefix frontend run test:coverage -- --runInBand` - failed because
  Vitest does not support the Jest `--runInBand` flag; reran without it.
- `npm --prefix frontend run test:e2e -- --project=VRAM-Calculator` - failed
  because this repo currently defines only the `chromium` Playwright project.
- Selected the frontend spec because the training checkbox wording was an open
  launch UX item with direct Vite and no-build fallback coverage; the frontend
  lint gate then required splitting oversized existing files without relaxing
  rules.

## Working Tree Notes

- Existing unrelated dirty paths remain outside this iteration's commit scope.
- `docs/plan.md` has an unstaged cleanup from this pass; preflight treats it as
  protected, so it is left for human review.
- Leave `frontend/example_user_will_delete/` alone. The user will delete it once
  the frontend is done.
