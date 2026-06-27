# Orchestration Spec

Goal: Maintain global state. Coordinate short headless agents until `docs/plan.md`, `specs/frontend.md`, and `specs/backend.md` are implemented and the repo is launchable as a Vite-only calculator.

## Current Truth

- `docs/plan.md` owns product goals, naming, and calculation formulas and is human maintaind aas the MASTER DOCUMENT to derive from.
- `specs/frontend.md` owns frontend UI, TypeScript report generation, outputs, warnings, checks, and corrected expected values.
- `specs/backend.md` owns removal of Python/FastAPI, `/api/report`, WSGI, backend-only tests, and stale backend docs.
- Remaining work order is frontend parity first, backend removal second, docs/status cleanup last.
- Do not preserve legacy heuristic results as correctness tests. If needed, isolate them as legacy compatibility tests.

## Orchestrator Role

- You are the overseer of the project, holding high-level context while headless agents are laser-focused on task commpletion.
- You only edit `.md` files.
- You only let one agent run at a time.

> one loop orchestrator process begins
**LOOP**
- Launch with `harness run codex 1 20`.
- Each agent has orders to update their spec after task completion.
- After each agent updates their spec do this:
  - Review the just-updated spec and update it **MINIMALLY** to a state for the next agent using that spec to succeed.
  - Keep specs truthful, concise, and specific for the next 20-minute agent.
  - Inspect git status and perform necessary git actions or report issues to the human
  - Launch a new Claude agent to code review the work in the files the Codex agent just edited `harness run claude 1 20`.
  - Integrate the code review findings into the relevant spec.
  - Choose the next highest-priority unfinished task.
  - Before launching an agent, put the assigned spec name and objective at the top of `PROMPT.md`.
**RE-ENTER LOOP** line 18
> one loop orchestrator process ends (and begins again above)

- If an agent has run longer than `0.5 * max_minutes` you launched it with, you commit it's work, get it code-reviewed, and kill that agent process.
- Compact your contaxt during lulls in activity, before ~40% of auto0compaction trigger.

## Agent Queue

1. Frontend agent: implement `specs/frontend.md` until local TypeScript report generation and corrected frontend tests pass + human has no more frontend feedback to add to `plan.md`.
2. Backend agent: implement `specs/backend.md` only after frontend parity exists.
3. Docs/status agent: update README, docs, and specs to match the final Vite-only state.

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
