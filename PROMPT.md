# Assigned Spec

`specs/frontend.md`

Objective: Close the three remaining "Minor" items in `specs/frontend.md`
"Open Parity Gaps":
1. `cloudCost` (`frontend/src/hardware.ts` ~L70) ignores `recommended_gpu_count`
   on the >320GB overflow path — scale cost by GPU count per `docs/plan.md`
   instead of a flat fallback.
2. Remove the dead `_hasLocalFile` parameter (`frontend/src/calculator-core.ts`
   ~L182,222) since the GGUF-vs-generic local distinction is never branched on;
   if `specs/frontend.md` claims that distinction, make the code honor it OR
   drop the claim — keep code and spec consistent.
3. Zero-row hiding (`frontend/src/report.ts` ~L14) is exact `=== 0`; hide rows
   that round to `0.0 GB` (e.g. `< 0.05`) per `specs/frontend.md` "zero rows are
   hidden".
Re-derive any affected expected test value from `docs/plan.md`. Then remove the
Minor item from `specs/frontend.md` "Open Parity Gaps". Keep build/coverage/e2e/
gate green. Update `specs/frontend.md` and `docs/PROJECT_STATUS.md` concisely.

Only change `frontend/src/hardware.ts`, `frontend/src/calculator-core.ts`,
`frontend/src/report.ts`, and their affected `frontend/src/*.test.ts` /
`frontend/tests/*.spec.ts`. Do NOT touch `frontend/src/render.ts`,
`frontend/src/styles.css`, `docs/plan.md`, or `README.md` — those have
in-progress styling/owner edits. When committing, `git add` ONLY your changed
files; never `git add -A`.

You are an implementation worker, not the orchestrator. Do not run `harness run
codex`, `harness run claude`, or launch any nested agents. `RALPH_LOOP=1` is
expected inside this worker; it is not a blocker unless you are about to launch
another `harness run ...` process. Do not read or act on `specs/orchestrate.md`.

# Ralph loop prompt

You are one fresh-context iteration of the loop. The repo is your memory.

1. Read `specs/frontend.md` and the relevant `docs/plan.md` sections.
2. Inspect `hardware.ts`, `calculator-core.ts`, `report.ts` and their tests.
3. Implement the three scoped fixes; finish within 20 minutes.
4. `git fetch origin` before work to inspect git state.
5. Update tests with expected values derived from `docs/plan.md`; do not weaken.
6. Run `harness gate`. If `harness` is not on PATH, run `.venv/bin/harness gate`.
7. Fix failures without weakening tests, coverage, typing, security, or the gate.
8. Commit on the current branch through the normal git hooks (targeted git add).
9. Push with plain `git push`. Never pull, merge, rebase, force-push, or reset.
   If push is rejected, document it in `docs/PROJECT_STATUS.md`. Do not retry a
   status-only commit more than once.
10. Update `specs/frontend.md` and `docs/PROJECT_STATUS.md` to match changes.

Rules:
- Do not create a branch, worktree, or any new files.
- Do not batch unrelated work; keep history linear on the current branch.
- If forbidden paths block a commit, `git restore --staged <path>` and leave
  those edits for human review.
- Never delete tests or assertions merely to make checks pass.
- Do not edit forbidden paths: `AGENTS.md`, `harness/`, `tests/harness/`,
  `.githooks/`, `.github/`, `PROMPT.md`, or `pyproject.toml`.

Commit message:
```
One sentence summary

- concrete detail
- concrete detail

codex-frontend-1/1
```
