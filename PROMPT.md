The repo is your memory.

1. Read `specs/` — that is what we must build. (If there is work in specs, you MUST implement it. You MUST commit it. Do not exit early.)
2. Then, survey the code. Find the single most important thing the specs require that the code does not yet do (or does wrong).
3. Do exactly the most gap you identified from the code and `specs`. Keep the change small and tightly scoped.
4. Work in the current checkout. Do not create a worktree unless the user explicitly asked for one. If the working tree is dirty before your iteration, commit or stash it depending on whether the specs require that work.
5. Run: `ruff check . && ruff format --check . && pytest`. If it is red (lint, format, tests, or <100% coverage on any file with code), fix it to pass.
6. Add or update a test that proves your change works. Write tests which challenge the source code. Do not create test theater to say you got to 100% code coverage. Add tests or asserts but do not delete tests.
7. Commit directly on the current branch. If the user explicitly asked for a branch/worktree, rebase it onto `main`, run the full gate there, then fast-forward merge with `git merge --ff-only <branch>`.
8. COMMIT AND PUSH WORK TO GITHUB EVERY ITERATION! After committing, run `git push` to publish this iteration's commit to the remote (use `git push -u origin <branch>` on a new branch). The pre-push hook runs the full verify; a green push saves your work on GitHub. Never end an iteration with unpushed commits. Never end an iteration with failing lint/tests/checks.
9.  Update the `specs/`, `docs/`, and `PROJECT_STATUS/`, to honestly reflect your changes. Remove or explain items you completed. Keep each `.md` < 100 lines.

Rules:
- One tightly scoped, meaningful change per iteration. Do not batch unrelated work. Do not skip work.
- Specs say *what*. You decide *how* and *what is most important next*.
- If a spec is wrong or missing, update the spec instead of guessing.
- Never weaken the gate, tests, or coverage to make a commit pass.

Commit Message Structure:
```
A one sentence summary
- list items with details of work completed
- ...
- ...

# End the commit message with your "name", spec keyword, and loop numbers iteration-count / RALPH_ITERATIONS_TOTAL, e.g.:
Claude-backend-1/10
```
