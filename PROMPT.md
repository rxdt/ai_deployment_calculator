The repo is your memory. Specs say what to build. You decide what is the next most useful change.

YOU ARE NOT ALONE: multiple agents work in this repo at the same time. Claim your spec (see rules), expect concurrent edits and commit clashes, and never assume the working tree or a spec is exactly as you last left it — re-read before you act.

1. Read `specs/frontend.md`. The app needs to be shippable TODAY.
2. CLAIM the spec you will work (see Rules) and commit that claim FIRST, before any other edit.
3. Inspect the relevant code and tests before editing.
4. Implement the changes that advance your chosen unfinished items.
5. Update tests which prove behavior and challenge the source; use durable, behavior-focused names and docstrings.
6. Run `pnpm preflight`.
7. Commit grouped items.
8. Fix failures without weakening tests, coverage, typing, security checks, or the gate.
9. SHRINK specs to the truth: DELETE every contract/item you completed (no struck `[x]` DONE notes left behind), and update `docs/PROJECT_STATUS.md` to match what changed. Keep only what the NEXT agent needs.
10. List blockers in `docs/PROJECT_STATUS.md`.
11. Run `pnpm gate` as a final check.
12. RELEASE your claim: remove your claim line from the spec. Commit on the current branch. This step is NON-OPTIONAL — a run that ends without releasing its claim is an incomplete run.

Rules:

- CLAIM before you work (step 2): add a line at the TOP of the spec you are taking — `<agent-id> is working on <these tasks> in this spec` — so no other agent takes it. Commit that claim BEFORE any other edit. Skip any spec that already carries another agent's claim line and pick the next unclaimed one. RELEASE the claim (step 12) when you finish or abandon — a run that leaves its claim line behind is incomplete. If you find a claim line whose agent is plainly gone (its work is committed or the tree is clean), you may reap it and claim the spec yourself.
- Specs SHRINK as work completes (step 9): DELETE each contract/item when it is done — do not leave a struck `[x]` or a DONE note; the git history is the record. A spec with no remaining work is DELETED, not archived. Carry forward only what the next agent needs (a one-line "shipped" belongs in `docs/PROJECT_STATUS.md`, not the spec). A growing spec is a red flag that we are not doing our job.
- Expect commit CLASHES with parallel agents — that is OK. Do not stop or try to reconcile a dirty git state; a dirty working tree is tolerated until all specs/tasks are cleared. Commit your own scoped work, leave others' changes alone, and keep moving.
- Use all your allotted time (90 wall clock minutes) to do productive work. Do NOT fake work. Do NOT skip out early. It is a waste of the owner's real world tokens and money.
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
