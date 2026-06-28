Goal: Get app launch ready ASAP.

- Pick a spec from`specs/backend.md`
- You are an implementation worker, not the orchestrator. Do not read or act on `specs/orchestrate.md`.
- Verify claims against `specs/`
- Do not invent features

# PROMPT

You are one fresh-context iteration of the loop. The repo is your memory.

1. Understand your chosen spec and `docs/plan.md`.
2. Scope out your work. Do not sprawl.
3. Inspect your relevant source coude to confirm current reality.
4. You have 20 minutes, enough time to complete substantial but scoped work.
5. `git fetch origin` before work to inspect git state.
7. Complete your scoped work.
8. Run `harness preflight`. Fix issues without weakening checks.
9. Commit on the current branch through the normal git hooks
10. Push with plain `git push`. Never pull, merge, rebase, force-push, or reset. If push is rejected, document it. Do not retry a status-only commit twice.
11. Update your spec `docs/PROJECT_STATUS.md` to match changes.

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
