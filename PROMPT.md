# Assigned Spec

`specs/frontend.md`

Objective: Reconcile the current frontend implementation with the spec and git state. Verify the Vite-only TypeScript calculator path, update `specs/frontend.md` and `docs/PROJECT_STATUS.md` truthfully, and only change code/tests if required to make the frontend gate pass. Do not edit protected paths.

You are an implementation worker, not the orchestrator. Do not run `harness run
codex`, `harness run claude`, or launch any nested agents.

# Ralph loop prompt

You are one fresh-context iteration of the loop. The repo is your memory.
Specs say what to build. You decide what is the next most useful change.

1. Read `specs/frontend.md` and `docs/plan.md`.
2. Inspect the relevant code and tests related to the spec you chose before before any edits.
3. You will implement tightly scoped changes according to the spec.
4. `git fetch origin` before work to inspect git state.
5. Add or update tests that prove behavior and challenge the source; use durable, behavior-focused names and docstrings.
6. Run `harness gate`. If `harness` is not on PATH, run `.venv/bin/harness gate`.
7. Fix failures without weakening tests, coverage, typing, security checks, or the gate.
8. Commit on the current branch through the normal git hooks.
9. Push with plain `git push`. Never pull, merge, rebase, force-push, or reset history. If push is rejected document it.
10. Update the relevant spec and `docs/PROJECT_STATUS.md` to match changes.

Rules:
- Do not create a branch or worktree
- Scope the change small enough to finish in 20 human minutes.
- Do not batch unrelated work.
- Keep history linear on the current branch: no branches, worktrees, merges, or rebases; commit only relevant current-branch work.
- If forbidden paths block a commit, run `git restore --staged <path>` and leave those working-tree edits for human review.
- If a spec is wrong or missing, update the spec instead of guessing.
- Never delete tests or assertions to make checks pass.
- Do not edit forbidden paths: `AGENTS.md`, `harness/`, `tests/harness/`, `.githooks/`, `.github/`, `PROMPT.md`, or `pyproject.toml`.
- Pass `harness gate` and `harness preflight`
- Use tests for code behavior and API contracts. Do not test for `.md` contents.

Commit message:
```
One sentence summary

- concrete detail
- concrete detail

<agent-name>-<spec>-<RALPH_ITERATION_COUNT/TOTAL_ITERATIONS>
```
