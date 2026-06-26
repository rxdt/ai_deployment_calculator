# Launch Orchestration Spec

PRIORITY 2

## Vision

User comments in plan.md are addressed in specs. We are ready to launch.

## Current Truthful State

- `specs/frontend.md` remains the implementation spec for the app launch.
- Vite builds, calls `/api/report`, and is served by FastAPI from `frontend/dist`.
- FastAPI keeps `/api/report` available before frontend assets exist and falls
  back to the no-JS page when the build is missing.
- Mocked Playwright, real-backend Playwright, Vitest coverage, frontend gate,
  harness preflight, and harness gate are green in this workspace.
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

- The current `.githooks/pre-commit` change is protected and fails normal
  commits with `line 12: $1: unbound variable`.
- `.github/workflows/frontend-ci.yml` cannot be installed by agents because
  `.github/` is protected.

## Changelog

- Codex-frontend-1/1: replaced placeholders with the real launch orchestration
  state after confirming `harness gate` and `harness preflight` are green.
