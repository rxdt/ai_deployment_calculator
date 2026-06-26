**GOAL: LAUNCH TODAY**

You are a fresh session agent. Treasure and preserve that fresh context. The current repo is your memory.
Specs say *what* work to do. You decide *how* and *what is most important next*.

0. Finish as much as possible ASSAP. We launch NOW!
1. Read `plan.md/`. Find a task in `specs/`. If there is work remaining in specs, you must work on it.
2. Fix the gap you identified.
3. Keep youf change small and TIGHTLY SCOPED! You have 20 minutes max.
4. Run `uv run harness preflight` to see if your changes pass. Fix failures.
5. NEVER create a branch or worktree. Keep a strictly linear history on the current branch.
  - Do not run `git branch`, `git checkout -b`, `git switch -c`, or `git worktree`.
  - Commit only on the current branch. No merges, no rebases that fork history.
  - If git is dirty before your turn, commit it depending on whether the specs require that work.
  - When a commit is rejected for a forbidden-path, run `git restore --staged <forbidden-path>` to clear the commit blocker.
  - Leave the working-tree change in place for a human to review
6. Add or update a test that proves your change works.
  - Write tests which challenge the source code.
7. Commit on the current branch only — never branch, fork, or merge.
8.  If `uv run harness gate` fails for any reason, fix the issue.
  - If you have tried to fix the issue multiple times and cannot:
    - Commit the files that do pass.
    - Mention the issue / filepath in `docs/PROJECT_STATUS.md` under "Blockers" and state your agent name and spec name.
9.  Update `specs/`, `docs/`, and `docs/PROJECT_STATUS.md` to honestly reflect changes.
  - Remove items you completed.
  - Keep each `.md` < 100 lines.
LET"S GET THIS LAUNCHED!!

Commit Message Structure:
```
A one sentence summary
- list items with details of work completed
- ...
- ...

# End the commit message with your "name", spec keyword, and loop number iteration-count / RALPH_ITERATIONS_TOTAL, e.g.:
Claude-backend-1/10
```

Rules:
- One tightly set, meaningful change per turn.
- Do not batch unrelated work.
- Do not skip working during your turn.
- If a spec is wrong or missing, update the spec instead of guessing.
- Never weaken code to make a commit pass.
- NO branches, NO worktrees, NO merges. Linear history only.

**Do NOT edit or commit forbidden paths:** AGENTS.md, harness/, tests/harness/, .githooks/, .github/, pyproject.toml. Your commits will be auto-rejected if you do.
