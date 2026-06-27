# Orchestration Spec

Goal: Maintain global state. Coordinate short headless agents until `docs/plan.md`, `specs/frontend.md`, and `specs/backend.md` are implemented and the repo is launchable as a Vite-only calculator.

## Current Truth

- PRIORITIZE: Remaining work order is frontend first, backend hardening second, end to end testing and hardening last.
- `docs/plan.md` owns product goals, naming, and calculation formulas. It is the MASTER DOCUMENT to derive from. Humans add to it. Agentc can edi and pull from this document to organize `.md`.
- `specs/frontend.md` owns frontend UI, TypeScript report generation, outputs, warnings, checks, and corrected expected values. Frontend is HIGHLY incomplete. Frontend does not look like it should and is missing the implementation of requisite inputs/ouputs.
- frontend is the least complete item. Frontend items in spec need to be completed. Then, frontend requirements from `plan.md` must be put into frontend spec.
- `specs/backend.md` owns removal of Python/FastAPI, `/api/report`, WSGI, backend-only tests, and stale backend docs.
- Do not preserve legacy heuristic results as correctness tests. If needed, isolate them as legacy compatibility tests.

## Orchestrator Role

- If `PROMPT.md` says "implementation worker", this spec does not apply to
  you. Follow the assigned spec in `PROMPT.md` instead.
- You are the overseer of the project, holding high-level context while headless agents are laser-focused on task commpletion.
- You only edit `.md` files.
- Remove completed items to `.md`. If we are done with the project, `.md` should reflect that.
- You only let one agent run at a time.
- If you are already running inside `harness run codex` or `harness run claude`,
  do not launch another agent; update handoff markdown and report the blocker.

> one loop orchestrator process begins
**LOOP**
- Launch [`specs/frontend.md`](frontend.md) with `harness run codex 1 30`.
- Launch [`specs/backend.md`](backend.md) with `harness run codex 1 20`.
- Each agent has orders to update their spec after task completion.
- After each agent updates their spec do this:
  - Review the just-updated spec and update it **MINIMALLY** to a state for the next agent using that spec to succeed.
  - Update `plan.md` and `docs/PROJECT_STATUS.md`.
  - Keep specs truthful, concise, and specific for the next agent.
  - Inspect git status and perform necessary git actions or report issues to the human
  - Launch a new Claude agent to code review the frontend and backend work in the files the Codex agents just edited: `harness run claude 1 30` with new `specs/code_review.md` that includes "Review this branch with explorer and reviewer"
  - Integrate the code review findings into the relevant spec.
  - Choose the next highest-priority unfinished task.
  - Before launching an agent, put the assigned spec name and objective at the top of `PROMPT.md`.
**RE-ENTER LOOP** line 23
> one loop orchestrator process ends (and begins again above)

- Compact your contaxt during lulls in activity, before ~60% of auto-compaction trigger.

## Agent Queue

1. Orchestrator agent (*this*) agent, manages the workflows and specs/plan. Ensure we get to launch ASAP. **Reports blockers as top priorities P0.**
2. Frontend agents: implement `specs/frontend.md` until local TypeScript report generation and corrected frontend tests pass + human has no more frontend feedback to add to `plan.md`.
3. Backend agents: implement `specs/backend.md` only after frontend parity exists.

## Guardrails

- Do not edit protected paths: `AGENTS.md`, `harness/`, `tests/harness/`, `.githooks/`, `.github/`, `pyproject.toml`.
- Do not run multiple agents at once.
- Do not let agents mix old `/api/report` examples with corrected calculator tests.
- Do not leave completed checklist clutter unless it helps the next agent avoid repeating work.
- Keep git state clean and call out user-owned changes instead of reverting them.
- Do NOT write code, tests, or configs yourself.

## Acceptance Signals

- `npm run gate` passes.
- No frontend source calls `/api/report`.
- Only javascript frontend calculator path + python harness relic remains.
- README/specs describe Vite-only operation.
- Branch is pushed when hooks allow it.
- Human approves the frontend experience manually.

## Blockers

- `.github/` is protected; workflow edits require the human owner.
- Harness-owned paths are protected; agents must not edit them.

## Changelog

- 2026-06-27: `PROMPT.md` now marks spawned workers as implementation workers
  and forbids nested `harness run codex` / `harness run claude` launches.
  Human verifying during this run if Codex can run Claude nested and vice versa.
- observations:
  - must tighten language in `orchestrate.md` so orchestrator knows how to prevent <issues> observed in latest run
  - prompt precedence/context leakage into the worker when orchestrator launches headless agent even when prompt says _'do NOT orchestrate, do THIS.'_
  - when running an orchestrator, `harness run codex` is giving the child enough context that it follows specs/orchestrate.md
  - using the old harness Python ralph.sh NOT the new (supposted to be identical Js ralph.sh)
  - Claude flags --bare --no-session-persistence --fork-session
  - npm exec --package . -- harness run codex 1 20
  - `codex exec --json "Review this branch with explorer and reviewer"`, Codex spawns flat, parallel worker threads (explorer, reviewer, worker) in a managed cloud environment or local worktree to split up tasks simultaneously
