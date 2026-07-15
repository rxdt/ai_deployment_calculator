<div align="center">
<img src=".banner.svg" alt="Blue infinity loop" width="360">

<h1>L∞pGate</h1>
<p><em>frontend edition</em></p>

#### Originally built to demo [L∞pGate for frontend](https://github.com/rxdt/loopgate_js)

# [AI Deployment Calculator](https://vram.rxdt.dev/)

A free VRAM calculator for AI models. Not just for LLMs: text generation,
embeddings, vision, multimodal, image diffusion, video, audio, and tabular
workloads, across inference, LoRA/QLoRA fine-tuning, and full training.

Static Vite + TypeScript. Every calculation runs in the browser. No backend,
no ads, no signup, no tracking. The formula, per-component breakdown, and
assumptions behind every estimate are shown in the UI, and recommendations are
measured against _usable_ VRAM (advertised capacity minus the driver/CUDA
reserve), **not** the sticker number.

_[The loop harness that built this is here](https://github.com/rxdt/loopgate_js)_

_[Based on the (more mature) Python ralph agent harness](https://github.com/rxdt/loopgate_harness)_

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
