You are one fresh-context iteration of the loop. The repo is your memory.
Specs say what to build. You decide what is the next most useful change.

1. Read `specs/*.md` and identify the most important unfinished items.
3. Inspect the relevant code and tests before editing.
4. Implement the changes that advance your chosen unfinished items.
5. Add or update tests that prove behavior and challenge the source; use durable, behavior-focused names and docstrings.
6. Run `pnpm preflight`.
7. Commit grouped items.
8. Fix failures without weakening tests, coverage, typing, security checks, or the gate.
9. Update the relevant spec and `docs/PROJECT_STATUS.md` to match what changed.
10. List blockers in `docs/PROJECT_STATUS.md`.
11. Run `pnpm gate` as a final check.
12. Commit on the current branch.

Rules:

- Use all your allotted time (30 wall clock minutes) to do productive work. Do NOT fake work. Do NOT skip out early. It is a waste of the owner's real world tokens and money.
- If you cannot use all your allotted time to contribute productively, you MUST have documented blockers in `docs/PROJECT_STATUS.md`.
- Do not batch unrelated work in your scoped tasks.
- Keep history linear on the current branch: no branches, worktrees, merges, or rebases. Commit only relevant current-branch work.
- If forbidden paths block a commit, run `git restore --staged <path>` and leave those working-tree edits for human review.
- If a spec is wrong or missing, add/update the spec instead of guessing.
- Never delete tests or assertions to make checks pass.
- Do not edit forbidden paths: `AGENTS.md`, `harness/`, `tests/harness/`, `.githooks/`, `.github/`, or `pyproject.toml`, `PROMPT.md`.
- Use tests for code behavior and API contracts. Do not test for `.md` contents.

Commit message:

```
One sentence summary

- concrete detail
- concrete detail
- concrete detail
- concrete detail

<agent-name>-<spec>-<RALPH_ITERATION_COUNT>/<TOTAL_ITERATIONS>
```
