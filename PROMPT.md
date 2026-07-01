Goal: Get app launch ready ASAP.

- Focus on finishing `specs/md` work.
- You are an implementation worker.
- Do not invent features.

# PROMPT

You are one fresh-context iteration of the loop. The repo is your memory.

1. Understand your spec and `/plan.md`.
2. Scope out your work. Do not sprawl.
3. Inspect your relevant source coude to confirm current reality.
4. You have 1 hour, enough time to complete SUBSTANTIAL work. Use the entire time allotted. Scope work accordingly.
5. `git fetch origin` before work to inspect git state.
6. Run `harness preflight` to find and fix issues.
7. Implement your scoped work in stages.
8. Make small commits as you go on the current branch through the normal git hooks.
9. Run `harness gate`. Fix issues without weakening checks.
10. Squash only your commits.
11. Push with plain `git push`. Never pull, merge, rebase, force-push, or reset. If push is rejected, document it. Do not commit with status-only no-files.
12. Update your spec and `docs/PROJECT_STATUS.md` to match changes.

Rules:

- Do not create a branch, worktree, or any new files.
- Do not edit forbidden paths: `AGENTS.md`, `harness/`, `tests/harness/`,
  `.githooks/`, `.github/`, `PROMPT.md`, or `pyproject.toml`.

Commit message:

```
One sentence summary

- concrete detail
- concrete detail

codex-backend-1/1
```
