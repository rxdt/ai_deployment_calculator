The repo is your memory. Specs say what to build. You decide what is the next most useful change.

P0 — VERACITY AND ACCURACY OF THE APP IS PARAMOUNT, ALL AROUND. Correct numbers are the whole product; a wrong estimate is worse than shipping nothing. Accuracy outranks features, polish, speed, and deadlines.

WHY ACCURACY MATTERS MORE HERE THAN IN OTHER APPS: this is a VRAM *calculator* whose one job is to answer "will this model fit on this GPU, and what will it cost?" Users make real hardware-purchase and cloud-spend decisions on the number. Near a card boundary a tiny error flips the answer: a 23.5 GB estimate that is really 24.6 GB tells someone a model fits on a 24 GB card when it will OOM. So a "small" percentage error is not small — it is a wrong fit/no-fit verdict. This is also THE demo app for an AI-built project: if AIs cannot make a calculator correct, nothing else we claim is credible.

THE ACCURACY BAR (concrete): (1) NEVER under-estimate VRAM — under-estimation causes OOM and is the unforgivable direction; when unsure, round toward MORE memory, never less. (2) Every component (weights, KV, activation, training state) must be within ~2% of its published external anchor, and totals must not cross a hardware-tier boundary the anchors don't support. (3) A value that cannot be defended against an external anchor does not ship — say so instead. (4) Numbers trace to the Research Corrections math and published anchors (`specs/plan.md` Goal, `specs/qa.md`), never to a competitor shortcut, our own formulas restated, or a convenient guess. Treat any accuracy defect as a release blocker, not a backlog item.

CURRENT PRIORITIES (in order): (1) the PRIORITIES list in `specs/plan.md`; (2) the adversarial oracle / QA accuracy work (`specs/qa.md`); (3) everything else. SEO is crucial (the site is announced) but never at the cost of an accuracy regression. Parked / do-not-build: see `specs/plan.md`. Owner-only actions pending (agents must NOT attempt them): production redeploy — see `docs/PROJECT_STATUS.md`.

YOU ARE NOT ALONE: multiple agents work in this repo at the same time. Claim your spec (see rules), expect concurrent edits and commit clashes, and never assume the working tree or a spec is exactly as you last left it — re-read before you act. MAINTAIN your claimed spec BEFORE (claim it + read it fully), DURING (keep it the accurate source of truth as you work — correct it the moment reality diverges), and AFTER (shrink out completed items, release your claim). A spec that lies about the current state is worse than no spec.

1. Read the specs in `specs/` (start with `specs/plan.md`, then the priority specs above). The app is LIVE and announced; correctness comes before new work.
2. CLAIM the spec you will work (see Rules) and commit that claim FIRST, before any other edit.
3. Inspect the relevant code and tests before editing.
4. Implement the changes that advance your chosen unfinished items.
5. Update tests which prove behavior and challenge the source; use durable, behavior-focused names and docstrings.
6. Run `pnpm preflight` before EACH commit — this is the commit bar (format, lint, style, html; fast, no browsers). Commit only when `preflight` is green. Do NOT run `pnpm gate` per commit.
7. Commit grouped items on green `preflight`.
8. Fix failures without weakening tests, coverage, typing, security checks, or the gate.
9. SHRINK specs to the truth: DELETE every contract/item you completed (no struck `[x]` DONE notes left behind), and update `docs/PROJECT_STATUS.md` to match what changed. Keep only what the NEXT agent needs.
10. List blockers in `docs/PROJECT_STATUS.md`.
11. Run `pnpm gate` ONCE, at the END of your run, as the final check — it MUST exit 0 before you end. `gate` is the push bar (adds tests, coverage, e2e browsers, Lighthouse) and is EXPENSIVE — run it once, not per commit. Budget several minutes for it; never start it so late the loop's timeout kills it mid-run (that orphans browsers and cooks the machine).
12. RELEASE your claim: remove your claim line from the spec. Commit on the current branch. This step is NON-OPTIONAL — a run that ends without releasing its claim is an incomplete run.

Rules:

- GATE vs PREFLIGHT — do not confuse them. `pnpm preflight` (fast: format/lint/style/html, no browsers) is the PER-COMMIT bar — run it before every commit. `pnpm gate` (adds tests/coverage/e2e-browsers/Lighthouse) is the END-OF-RUN / push bar — run it ONCE at the end, never per commit. Running the full gate on every commit spawns a browser swarm per commit and pegs the machine. Your run must END on a green `pnpm gate`; if you cannot get it green, REVERT and record the failing stage under `## Blockers` in `docs/PROJECT_STATUS.md` rather than leave `main` broken.
- ONLY THE OWNER DEPLOYS. NEVER run `git push`, `vercel`/`vercel deploy`, or any outward publish/deploy command — not to fix accuracy, not to fix SEO, not for any reason. The public site is live and announced; a bad or partial deploy is an outward-facing mistake only the owner may make. When work is deploy-ready, run the gate, write a one-paragraph deploy-delta summary, and hand the owner the exact command — then STOP. Committing to the LOCAL current branch is allowed; pushing to `origin`/deploying is FORBIDDEN.
- CLAIM before you work (step 2): add a line at the TOP of the spec you are taking — `<agent-id> is working on <these tasks> in this spec` — so no other agent takes it. Commit that claim BEFORE any other edit. Skip any spec that already carries another agent's claim line and pick the next unclaimed one. RELEASE the claim (step 12) when you finish or abandon — a run that leaves its claim line behind is incomplete. If you find a claim line whose agent is plainly gone (its work is committed or the tree is clean), you may reap it and claim the spec yourself.
- Specs SHRINK as work completes (step 9): DELETE each contract/item when it is done — do not leave a struck `[x]` or a DONE note; the git history is the record. A spec with no remaining work is DELETED, not archived. Carry forward only what the next agent needs (a one-line "shipped" belongs in `docs/PROJECT_STATUS.md`, not the spec). A growing spec is a red flag that we are not doing our job.
- KEEP GIT CLEAN. End every run with a committed, clean working tree — no stray uncommitted or untracked files. Commit your own scoped work in focused commits; if a commit clashes with a parallel agent, resolve it by keeping both sides' committed work (never discard another agent's changes), then leave the tree clean. Do not leave WIP behind for "later".
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
