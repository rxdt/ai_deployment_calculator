<div align="center">
<img src=".banner.svg" alt="Blue infinity loop" width="360">

<h1>LoopGate</h1>
<p><em>frontend edition</em></p>

# This is a sample app to demo LoopGate

### Built using [LoopGate for frontend](https://github.com/rxdt/loopgate_js) and **[LIVE HERE](https://aideploymentcalculator.vercel.app/)**

# [AI Deployment Calculator](https://aideploymentcalculator.vercel.app/)

A static Vite + TypeScript app for estimating GPU VRAM requirements and a
hardware memory tier for AI workloads. Calculations run in the browser; there is
no backend report service.

_[The Python loop harness is here](https://github.com/rxdt/py_ralph_frame)_

![VRAM Deployment Calculator screenshot](.calc.png)

</div>

## Supports

- text generation, embeddings, encoder-decoder, vision, multimodal
- image diffusion, video, audio, tabular, and custom workloads
- inference, LoRA, QLoRA, and full-training estimates
- known model file size overrides, MoE, sharding, and runtime assumptions

## Calculates

- usable VRAM required
- recommended hardware memory tier
- minimum advertised GPU capacity
- usable target, headroom, rough speed, formula, and assumptions

Core equation:

```txt
Required_GB = (Weights + Working_Memory + Training_State + Runtime_Overhead) * Buffer
```

Estimates vary with model architecture, kernels, quantization, sequence packing,
batching, sharding, offload, framework overhead, and runtime configuration.
Validate against your target stack before buying hardware.

## Key Files

- UI: `frontend/index.html` and `frontend/src/app.ts`
- State: `frontend/src/state.ts`
- Calculation: `frontend/src/calculator-core.ts`, `frontend/src/workload-memory.ts`
- Hardware tiers: `frontend/src/hardware.ts`
- Report assembly: `frontend/src/report.ts`
- Specs: `specs/plan.md`, `specs/frontend.md`

## Requirements

- Node.js `^22.16.0 || >=24.8.0`
- pnpm `>=10` (`pnpm@11.9.0` declared)

## Local

```sh
pnpm install
pnpm setup
pnpm dev
```

## Build

```sh
pnpm build
pnpm preview
```

## Deploy

Build output is static and lives in `frontend/dist`. Root-domain static host
settings:

```txt
pnpm build  # Build command
frontend/dist  # Publish directory
npx vercel deploy --prod  # redeploy vercel
```

If hosting under a subpath, set the Vite base path before building.

## Checks

```sh
pnpm preflight
pnpm gate
pnpm --prefix frontend run test:coverage
pnpm --prefix frontend run test:e2e
```
