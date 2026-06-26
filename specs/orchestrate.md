# Launch Orchestration Spec

PRIORITY:

Launch is close; current specs and status must stay truthful about shipped UI
behavior, checks, and blockers.

## Current Truthful State

- `specs/frontend.md` remains the implementation spec for the app launch.
- Vite builds, calls `/api/report`, and is served by FastAPI from `frontend/dist`.
- FastAPI keeps `/api/report` available before frontend assets exist and falls
  back to the no-JS page when the build is missing.
- The calculator UI renders results without the old memory-optimization advice
  paragraph.
- Current `main` is aligned with `origin/main` after fetch.
- Mocked Playwright, real-backend Playwright, Vitest coverage, and frontend gate
  were green in the prior launch pass.
- `harness gate` and `harness preflight` are green in this workspace.
- `frontend/ci.yml` is ready to copy to `.github/workflows/frontend-ci.yml` when
  protected workflow edits are allowed.

## Scope

- Keep docs truthful about launch readiness, checks, and blockers.
- Do not add calculator features, parser edge cases, or visual redesign work.
- Do not edit protected paths; workflow and hook changes require the human owner.

## Acceptance Signals

- `cd frontend && npm run build` passes.
- `cd frontend && npm run test:coverage` passes with 100% coverage.
- `cd frontend && npm run test:e2e` passes.
- `cd frontend && npm run test:e2e:real` passes.
- `cd frontend && npm run gate` passes.
- `harness preflight` passes.
- `harness gate` passes.
- A normal `git commit` succeeds through the configured hooks.
- The current branch is pushed.

## Blockers

- `.github/workflows/frontend-ci.yml` cannot be installed by agents because
  `.github/` is protected.
- Existing protected/user-owned working-tree edits remain outside this iteration:
  `.githooks/pre-push`, `PROMPT.md`, generated report HTML, and
  `frontend/example_user_will_delete/`.

## Changelog

- Codex-frontend-1/1: replaced placeholders with the real launch orchestration
  state after confirming `harness gate` and `harness preflight` are green.
- Codex-orchestrate-1/1: stopped rendering optimization advice in calculator
  UIs while leaving the API payload contract intact.
- Codex-orchestrate-1/1: refreshed stale orchestration blockers/status, but the
  commit is blocked by protected hook edits outside this iteration's scope.
- Codex-orchestrate-1/1: refreshed launch blocker/status text after fetch showed
  `main` aligned with `origin/main`.
