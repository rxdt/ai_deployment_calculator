# Task

You are one fresh-context iteration of a loop. The repo is your memory.
Specs say what to build. You decide what is the next most useful change.

1. Read `specs/` and identify the single most important unfinished item.
2. Inspect code and tests before editin anything.
3. Implement the tightly scoped change that advances the chosen item.
4. Add or update tests that prove behavior and challenge the source; use durable, behavior-focused names and docstrings.
5. Run `pnpm preflight` often. Ensure you pass `pnpm gate`.
6. Fix failures without weakening tests, coverage, typing, security checks, or a gate.
7. Update the relevant spec and `docs/PROJECT_STATUS.md` to match current state.
8. Flag blockers and issues you noticed the human should know about in `docs/PROJECT_STATUS.md`.
9. Leave the repo in a clean, resumable state.
10. Commit on the current branch.

Rules:

- Do not create a branch or worktree unless the human explicitly asked for one.
- Keep the change small enough to finish in this iteration.
- Do not batch unrelated work.
- Keep history linear on the current branch: no branches, worktrees, merges, or rebases; commit only relevant current-branch work.
- If forbidden paths block a commit, leave those working-tree edits for human review.
- If a spec is wrong or missing, verify what is true and update the spec.
- Never delete tests or assertions to make checks pass.
- Do not edit forbidden paths: `AGENTS.md`, `harness/`, `tests/harness/`, `.githooks/`, `.github/`, or `pyproject.toml`, `PROMPT.md`.
- Pass `gate` and `preflight`
- Use tests for code behavior and API contracts. Do not test for `.md` contents.

Commit message:

```
One sentence summary

- concrete detail
- concrete detail

<agent-name>-<spec>-<RALPH_ITERATION_COUNT/TOTAL_ITERATIONS>
```
