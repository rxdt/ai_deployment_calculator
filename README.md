# AI Deployment Calculator

A static Vite + TypeScript app for estimating GPU VRAM requirements and a
hardware memory tier for AI workloads. Calculations run in the browser; there is
no backend report service.

The app gives a heuristic sizing estimate before benchmark work on a target
model, runtime, and GPU stack. It does not estimate cloud cost, latency under
load, power, storage, networking, or provider availability.

## Supported Workloads

- text-generation / chat
- text embeddings / reranking / classification
- encoder-decoder generation
- vision understanding
- vision-language / multimodal
- image-generation / diffusion
- video-generation
- speech / audio
- tabular / classical ml
- custom / unknown

## What It Calculates

The report shows:

- estimated usable VRAM required
- recommended hardware memory tier
- minimum advertised GPU VRAM capacity
- usable VRAM target and headroom on the selected tier
- rough speed estimate
- memory breakdown and assumptions

The core equation is:

```txt
Required_GB = (Weights + Working_Memory + Training_State + Runtime_Overhead) * Buffer
```

Different workload families use different working-memory estimates. Transformer
generation uses architecture-based KV cache estimates. Encoder, diffusion,
video, audio, tabular, and custom workloads use family-specific heuristics.

## Important Limits

Estimates vary with model architecture, kernels, quantization, sequence packing,
batching, sharding, offload, framework overhead, and runtime configuration.

Known model file size can override parameter-based weight memory. MoE active
parameters affect rough speed, but they do not reduce resident model weight
memory by default. Aggregate sharded hardware tiers are considered only when
Memory Sharding is enabled in Advanced assumptions.

## Source Of Truth

- UI: `frontend/index.html` and `frontend/src/app.ts`
- State normalization: `frontend/src/state.ts`
- Calculation core: `frontend/src/calculator-core.ts`
- Workload memory and speed: `frontend/src/workload-memory.ts`
- Hardware tiers: `frontend/src/hardware.ts`
- Report assembly: `frontend/src/report.ts`
- Product/spec notes: `specs/plan.md` and `specs/frontend.md`

## Requirements

- Node.js matching `package.json`: `^22.16.0 || >=24.8.0`
- pnpm `>=10`

The repository package manager is declared as `pnpm@11.9.0`.

## Install

```sh
pnpm install
```

The repository also has a setup script:

```sh
pnpm setup
```

## Run

```sh
pnpm dev
```

The frontend dev server binds to `127.0.0.1`.

## Build And Preview

```sh
pnpm build
pnpm preview
```

## Checks

Fast checks:

```sh
pnpm preflight
```

Full gate:

```sh
pnpm gate
```

Frontend-only commands:

```sh
pnpm --prefix frontend run build
pnpm --prefix frontend run test:coverage
pnpm --prefix frontend run test:e2e
```

> do NOT DELETE!:

## Owner notes. DO NOT DELETE!!

- Semgrep CA trust-store issue triggered from sandbox. `env -u SEMGREP_SEND_METRICS harness loop...` with agent launch bypasses,
- Except for `plan.md`, all `.md` documents should stay < 100 lines.
- prompt precedence/context leakage into the worker when orchestrator launches headless agent even when prompt says _'do NOT orchestrate, do THIS.'_
- when running an orchestrator, `pnpm loop codex <args>` is giving the child enough context that it follows specs/orchestrate.md
- using the old harness Python ralph.sh NOT the new (supposted to be identical Js ralph.sh)
- `Claude flags --bare --no-session-persistence --fork-session`
- pnpm --package . -- harness loop codex 1 20
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude -p --permission-mode acceptEdits --output-format stream-json "Act as the team lead. Create an agent team, split this repo work into frontend verification, backend/docs verification, and review teammates. Coordinate through the shared task list. Do not run nested harness commands."` <- orchestrater prompt
- `codex exec --json "Spawn explorer and worker subagents..."`, Codex spawns flat, parallel worker threads (explorer, reviewer, worker) in a managed cloud environment or local worktree to split up tasks simultaneously. Sub-types: default, worker, explorer (read-heavy). ORCHESTRATE: Spawn two Codex subagents:
  - explorer: read-only, map the relevant files and risks.
  - worker: implement the smallest fix after explorer reports. Wait for both, reconcile conflicts, then run verification.
  - `brew install gitleaks` must be run by users. Same as `osv` scanner.

> do NOT DELETE!:
