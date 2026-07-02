Goal: Get app launch ready ASAP.

- Focus on finishing `specs/md` work.
- You are an implementation worker.
- Do not invent features.

# PROMPT

You are one fresh-context iteration of the loop. The repo is your memory.

1. Understand your spec and `/plan.md`.
2. Scope out your work. Do not sprawl.
3. Inspect your relevant source coude to confirm current reality.
4. Use your allotted time to complete SUBSTANTIAL work. Use the entire time allotted. Scope work accordingly.
5. `git fetch origin` before work to inspect git state.
6. Run `npm run preflight` to find and fix issues.
7. Implement your scoped work in stages.
8. Make small commits as you go on the current branch through the normal git hooks.
9. Run `npm run gate`. Fix issues.
10. Commit and identify yourself in the message.
11. Update your spec and `docs/PROJECT_STATUS.md` to match project reality.

Rules:

- Work on existing branch. Do not create a branch or worktree.
- Do not create new project files unless told to.
- Do not edit forbidden paths: `AGENTS.md`, `harness/`, `tests/harness/`,
  `.githooks/`, `.github/`, `PROMPT.md`, or `pyproject.toml`.

Commit message:

```
One sentence summary

- concrete detail
- concrete detail

codex-backend-1/1
```
