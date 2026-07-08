# Ralph loop prompt

You are one fresh-context iteration of the loop. The repo is your memory.
Specs say what to build. You decide what is the next most useful change.

1. Read `specs/*.md` and identify the most important unfinished items.
2. Inspect the relevant code and tests before editing.
3. Implement the scoped changes that advance important unfinished items.
4. Add or update tests that prove behavior and challenge the source; use durable, behavior-focused names and docstrings.
5. Run `pnpm preflight`.
6. Commit grouped items.
7. Fix failures without weakening tests, coverage, typing, security checks, or the gate.
8. Update the relevant spec and `docs/PROJECT_STATUS.md` to match what changed.
9. Run `pnpm gate` as a final check.
10. Commit on the current branch.

Rules:

- Keep the change scoped to finish in this 60 minute iteration.
- Do not batch unrelated work.
- Keep history linear on the current branch: no branches, worktrees, merges, or rebases. Commit only relevant current-branch work.
- If forbidden paths block a commit, run `git restore --staged <path>` and leave those working-tree edits for human review.
- If a spec is wrong or missing, update the spec instead of guessing.
- Never delete tests or assertions to make checks pass.
- Do not edit forbidden paths: `AGENTS.md`, `harness/`, `tests/harness/`, `.githooks/`, `.github/`, or `pyproject.toml`, `PROMPT.md`.
- Use tests for code behavior and API contracts. Do not test for `.md` contents.
- Pass `harness gate` and `harness preflight`

Commit message:

```
One sentence summary

- concrete detail
- concrete detail
...

<agent-name>-<spec>-<RALPH_ITERATION_COUNT/TOTAL_ITERATIONS>
```
