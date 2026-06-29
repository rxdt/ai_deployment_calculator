# AI Deployment Calculator

A browser-only calculator for estimating the GPU memory needed to run or train
AI workloads. It is meant to give a practical sizing answer before choosing
hardware, not to replace benchmark runs on a target stack.

The calculator covers text generation, embeddings and classification,
encoder-decoder models, vision, multimodal models, diffusion, video generation,
speech and audio, tabular ML, and custom workloads. It gives the clearest answer
for transformer inference, and marks rougher estimates for workloads where
runtime memory depends heavily on implementation details.

Use it when you need a quick usable-VRAM estimate, a recommended GPU class, and a
plain explanation of what drove the number. It does not estimate cloud cost,
latency under load, power, storage, networking, or provider availability.

Project contracts live in `specs/plan.md`; frontend implementation details live
in `specs/frontend.md`. README stays as the human entry point.

## Run

```sh
cd frontend
npm run dev -- --port 5173
```

Open `http://127.0.0.1:5173`.

Build:

```sh
cd frontend
npm run build
```

Preview:

```sh
cd frontend
npm run preview
```

## Check

```sh
cd frontend
npm run gate
```

For the full repository gate, run `.venv/bin/harness gate` from the repo root.

> do NOT DELETE!:
## Owner notes. DO NOT DELETE!!
- Semgrep CA trust-store issue triggered from sandbox. `env -u SEMGREP_SEND_METRICS harness run...` with agent launch bypasses,
- Except for `plan.md`, all `.md` documents should stay < 100 lines.
- prompt precedence/context leakage into the worker when orchestrator launches headless agent even when prompt says _'do NOT orchestrate, do THIS.'_
- when running an orchestrator, `harness run codex` is giving the child enough context that it follows specs/orchestrate.md
- using the old harness Python ralph.sh NOT the new (supposted to be identical Js ralph.sh)
- `Claude flags --bare --no-session-persistence --fork-session`
- npm exec --package . -- harness run codex 1 20
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude -p --permission-mode acceptEdits --output-format stream-json "Act as the team lead. Create an agent team, split this repo work into frontend verification, backend/docs verification, and review teammates. Coordinate through the shared task list. Do not run nested harness commands."` <- orchestrater prompt
- `codex exec --json "Spawn explorer and worker subagents..."`, Codex spawns flat, parallel worker threads (explorer, reviewer, worker) in a managed cloud environment or local worktree to split up tasks simultaneously. Sub-types: default, worker, explorer (read-heavy). ORCHESTRATE: Spawn two Codex subagents:
  - explorer: read-only, map the relevant files and risks.
  - worker: implement the smallest fix after explorer reports. Wait for both, reconcile conflicts, then run verification.
> do NOT DELETE!:
