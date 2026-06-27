# Orchestration Spec

Goal: Maintain global state. Coordinate short headless agents until `docs/plan.md`, `specs/frontend.md`, and `specs/backend.md` are implemented and the repo is launchable as a Vite-only calculator.

## Current Truth

- `docs/plan.md` owns product goals, naming, and calculation formulas. It is the MASTER DOCUMENT to derive from. Humans add to it. Agentc can edi and pull from this document to organize `.md`.
- `specs/frontend.md` owns frontend UI, TypeScript report generation, outputs, warnings, checks, and corrected expected values.
- `specs/backend.md` owns removal of Python/FastAPI, `/api/report`, WSGI, backend-only tests, and stale backend docs.
- Remaining work order is frontend parity first, backend removal second, docs/status cleanup last.
- Do not preserve legacy heuristic results as correctness tests. If needed, isolate them as legacy compatibility tests.

## Orchestrator Role

- You are the overseer of the project, holding high-level context while headless agents are laser-focused on task commpletion.
- You only edit `.md` files.
- Remove completed items to `.md`. If we are done with the project, `.md` should reflect that.
- You only let one agent run at a time.
- If you are already running inside `harness run codex` or `harness run claude`,
  do not launch another agent; update handoff markdown and report the blocker.

> one loop orchestrator process begins
**LOOP**
- Launch `specs/frontend.md` with `harness run claude 1 20`.
- Launch `specs/backend.md` with `harness run claude 1 20`.
- Each agent has orders to update their spec after task completion.
- After each agent updates their spec do this:
  - Review the just-updated spec and update it **MINIMALLY** to a state for the next agent using that spec to succeed.
  - Keep specs truthful, concise, and specific for the next 20-minute agent.
  - Inspect git status and perform necessary git actions or report issues to the human
  - Launch a new Codex agent to code review the frontend work in the files the Claude agent just edited `harness run codex 1 20`.
  - Launch a new Codex agent to code review the backend work in the files the Claude agent just edited `harness run codex 1 20`.
  - Integrate the code review findings into the relevant spec.
  - Choose the next highest-priority unfinished task.
  - Before launching an agent, put the assigned spec name and objective at the top of `PROMPT.md`.
**RE-ENTER LOOP** line 23
> one loop orchestrator process ends (and begins again above)

- If an agent has run longer than `0.5 * max_minutes` you launched it with, you commit it's work, get it code-reviewed, and kill that agent process.
- Compact your contaxt during lulls in activity, before ~40% of auto0compaction trigger.

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
