> Current launch handoff. Keep it short and current.

## Current State

- The active implementation spec is `specs/frontend.md`.
- Current branch is `main`; `git fetch origin` completed before this pass and
  local commits remain ahead of `origin/main`.
- Advice-removal implementation is in current history.
- Fallback QLoRA and MoE dependent controls are submittable before JavaScript
  runs; the enhancement script still disables them when appropriate.
- Finished specs have been removed so agents do not select stale work.
- The app is a static, single-page Vite app. There is no Python/FastAPI backend
  and no `/api/report`; the report is computed locally in TypeScript.
- The Python `src/` package and its `tests/` were removed; sizing logic was
  ported to `frontend/src/calculator.ts`, `hardware.ts`, and `report.ts`.
- `CalculatorApp.loadReport` normalizes form state and renders
  `buildReport(state)` synchronously — no fetch, stale-request, or error path.
- The dense architecture option renders as `Dense (Typical inference)`; the
  training checkbox renders as `GPUs are for model training`.
- Frontend logic is split into focused `app`, `render`, `state`, `validation`,
  `controls`, `types`, `calculator`, `hardware`, and `report` modules, with
  `frontend/src/main.ts` as the mount-only bootstrap.
- Vitest coverage is enforced at 100% statements, branches, functions, and lines
  for `frontend/src/**/*.ts`.
- Real CI lives under `.github/workflows/`; `frontend/ci.yml` is an
  inactive reference copy because workflow paths are protected.
- Manual `npm --prefix frontend run gate` runs frontend checks, JS harness
  self-tests, and then `.venv/bin/harness gate` so Python issues appear before
  `git push`.

## Next

1. P0: launch the next frontend worker only from a normal shell. This Codex
   worker must not treat its own `RALPH_LOOP=1` as a blocker.
2. `PROMPT.md` is set for `specs/frontend.md`: verify local TypeScript report
   parity, no `/api/report`, corrected values, UI/output coverage, and gate.
3. Human owner reviews remaining unrelated working-tree edits: `docs/plan.md`
   and the generated report HTML.
4. Human owner fixes or approves the protected pre-push hook loop-containment
   failure that blocks plain `git push`.

## Checks From This Pass

- `git fetch origin` - green; `main` had local commits ahead of `origin/main`
  before this pass.
- `harness gate` - failed in
  `tests/harness/test_integration.py::test_hook_allows_forbidden_path_without_loop`
  because this shell exports `RALPH_LOOP=1`.
- `env -u RALPH_LOOP harness gate` - green.
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
- `git push` - rejected by the pre-push hook because it runs the harness
  integration suite under `RALPH_LOOP=1`, causing the simulated non-loop commit
  test to inherit loop containment and fail.
- `npm --prefix frontend run test:coverage -- --runInBand` - failed because
  Vitest does not support the Jest `--runInBand` flag; reran without it.
- `npm --prefix frontend run test:e2e -- --project=VRAM-Calculator` - failed
  because this repo currently defines only the `chromium` Playwright project.
- Orchestration attempt from inside this active harness session was stopped
  after the child worker launched a nested `harness run codex`; orphaned child
  Codex processes from that attempt were terminated.
- Current orchestration attempt repeated that nested-launch failure; the child
  `harness run codex 1 20` process tree was terminated and no implementation
  worker completed.
- Current Codex orchestration pass detected `RALPH_LOOP=1` before launching
  workers and stopped at handoff updates, per `specs/orchestrate.md`.
- Follow-up frontend workers read `PROMPT.md` but still inherited the
  orchestration request and acted as orchestrators; they were interrupted.
  `PROMPT.md` and `specs/orchestrate.md` now explicitly yield to the assigned
  implementation spec, but this harness path remains unproven.
- Confirmed nesting by process tree, not just env: this orchestrator's `claude
-p` (PID parent of the shell) descends from `harness run claude 1 50` ->
  `harness/ralph.sh 1 50 claude` -> `gtimeout claude -p`. Definitive that any
  `harness run codex`/`harness run claude` here is a nested launch.
- Selected the frontend spec because the training checkbox wording was an open
  launch UX item with direct Vite and no-build fallback coverage; the frontend
  lint gate then required splitting oversized existing files without relaxing
  rules.

## Working Tree Notes

- Working tree was clean before this handoff update.
- Existing unrelated dirty paths may reappear outside this iteration's commit
  scope; do not revert user-owned files.
- Current branch has local commits that are not pushed because plain `git push`
  is rejected by the hook failure recorded above.
- Leave `frontend/example_user_will_delete/` alone. The user will delete it once
  the frontend is done.
