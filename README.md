# AI Deployment Calculator

A static single-page Vite + TypeScript app for estimating AI deployment VRAM.
The calculator runs in the browser: `CalculatorApp` normalizes form state, calls
local `buildReport(state)`, and renders the report synchronously. There is no
Python or FastAPI backend, and no `/api/report` route.

## App Shape

- Source lives in `frontend/`.
- Production builds are static files in `frontend/dist/`.
- Runtime profiles are `Local / Edge` and `Server / Cloud`.
- Cloud cost appears only for the `Server / Cloud` runtime profile.

## Inputs

The form includes workload family, total resident parameters, parameter unit,
precision, execution mode, runtime profile, and adaptive workload inputs:
context or sequence tokens, encoder-decoder input and output tokens, image
dimensions, video resolution and frames, audio length, tabular rows and
features, or a custom input size preset. Inference shows `Concurrent Requests`;
training modes show `Training Batch Size` with a `Micro Batch Size`
accessibility label.

Advanced assumptions include KV cache precision, known model file size, GPU
resident fraction, LoRA trainable percent, optimizer, GPU comparison, cloud cost
override, exact transformer architecture, and gradient checkpointing. `MoE Model`
is available only for supported workload families, with `Active Parameters`
shown after MoE is enabled.

## Outputs

Reports show total required memory, recommended hardware, minimum raw VRAM
needed, workload speed, accuracy, assumptions, warnings, and the calculation
used. The memory breakdown hides zero rows and can include model or pipeline
weights, KV cache, input or activation memory, training state, runtime overhead,
and safety buffer.

Recommended hardware includes the usable VRAM target and the raw VRAM math.
Cloud cost is omitted for `Local / Edge`.

## Run

```sh
cd frontend
npm ci
npm run dev -- --port 5173
```

Open `http://127.0.0.1:5173`. The report is computed locally from the form
state; calculating does not make a network request.

Build a static bundle with:

```sh
cd frontend
npm run build
```

Preview the built app with:

```sh
cd frontend
npm run preview
```

## Check

```sh
cd frontend
npm run gate
```

`gate` runs the frontend lint, type, security, build, and test checks, frontend
harness self-tests, and the repo Python harness gate. The git pre-commit hook
runs `.venv/bin/harness preflight`; the pre-push hook runs
`.venv/bin/harness gate`.

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
