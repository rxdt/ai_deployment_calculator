# Frontend Refactor Spec

PRIORITY 1 - frontend parity implemented; keep green.

## Current Contract

- The Vite app is static. There is no required report-service route, Python
  formula source, or fetch mock.
- `CalculatorApp` normalizes form state, calls local TypeScript
  `buildReport(state)`, and renders synchronously.
- Keep public names from `docs/plan.md`: `Workload Family`,
  `Text generation / chat`, `Text embeddings / reranking / classification`,
  `Encoder-decoder generation`, `Vision understanding`,
  `Vision-language / multimodal`, `Image generation / diffusion`,
  `Video generation`, `Speech / audio`, `Tabular / classical ML`,
  `Custom / unknown`, `Known Model File Size`, `Compare with my GPU`,
  `Total Resident Parameters`, `Precision`, `Execution Mode`,
  `Runtime Profile`, and `Advanced assumptions`.

## UI State

- Main form shows `Workload Family`, `Total Resident Parameters`,
  `Parameter Unit`, `Precision`, `Execution Mode`, `Runtime Profile`,
  adaptive input controls, adaptive workload size, and relevant `MoE Model`.
- Rare controls live in `<details><summary>Advanced assumptions</summary>`.
- Workload size label is `Concurrent Requests` for inference and
  `Micro Batch Size` for training; never reintroduce generic `Batch Size`.
- `MoE Model` appears only for text generation, embeddings, encoder-decoder,
  multimodal, and custom. `Active Parameters` appears only when checked.
- Changing workload family or execution mode rerenders adaptive controls without
  waiting for form submit.

## Calculation State

- `frontend/src/calculator.ts` owns the canonical equation:
  `(weights + KV + input/activation + training state + runtime overhead) *
  buffer`.
- Decoder KV is architecture-based. Encoders, vision, diffusion, audio,
  tabular, and custom workloads do not use the legacy `Active_P / 10` formula.
- `Known Model File Size` overrides parameter-based weight estimates.
- MoE active parameters affect speed and KV, not resident weight memory.
- Training modes use adapter/full-training state plus checkpointed activations;
  legacy `trained=on&use_adapter=on` query flags are ignored.
- Server defaults: overhead `1.5`, buffer `1.10`, utilization `0.85`.
  Local GGUF-style inference: overhead `0.5`, buffer `1.00`, utilization
  `0.90`. Training override: overhead `4.0`, buffer `1.25`, utilization
  `0.80`.

## Outputs

- Reports show `Total Required Memory`, `Recommended Hardware`,
  `Minimum Raw VRAM Needed`, workload speed, cloud cost only for
  `Server / Cloud`, and `Accuracy`.
- Breakdown labels are `Model / pipeline weights`, `KV cache`,
  `Input / activation memory`, `Training state`, `Runtime overhead`, and
  `Safety buffer`; zero rows are hidden.
- Recommended hardware includes required memory, usable VRAM target, and
  `required / utilization = minimum raw VRAM` math.
- Accuracy values are `File-size based`, `Component-based`,
  `Advanced override`, `Estimated`, and `Rough`.
- Warnings include the standard heuristic warning plus conditional estimated
  architecture, diffusion/video, MoE, training, local offload, tabular, vision,
  and audio warnings.

## Tests And Checks

- Unit tests pin corrected totals: `47B` MoE `113.1 GB`, default `8B`
  `21.3 GB`, `7B` full training `152.9 GB`, local exact `104B` `79.2 GB`,
  QLoRA defaults and `2%` cases, long-context GQA KV, and precision comparison.
- Unit tests cover conversion, precision map, file-size override, MoE resident
  memory, decoder KV scaling, no encoder KV, encoder-decoder memory,
  diffusion/video/audio/tabular scaling, LoRA, QLoRA, full training, hardware
  recommendation, confidence, cloud visibility, and legacy flag removal.
- Playwright covers accessibility, local report rendering, adaptive controls,
  no generic `Batch Size`, local cloud-cost hiding, MoE visibility, and escaping.
- `frontend/src/legacy-approximations.test.ts` was deleted; do not reintroduce
  it or any legacy-approximation test.
- Required commands: `npm --prefix frontend run build`,
  `npm --prefix frontend run test:coverage`,
  `npm --prefix frontend run test:e2e`, `npm --prefix frontend run gate`,
  `.venv/bin/harness gate`, `harness preflight`.

## Open Parity Gaps (code review)

Gaps #1-#4 and minor parity items are closed and verified plan-conformant by
code review (expected values hand-recomputed from `docs/plan.md`). Remaining:

- For human: VL pixel-proxy (`workload-memory.ts` L62) multiplies the proxy by
  `image_count`; `docs/plan.md` L211 defines it per single image. Default
  `image_count=1` so no test impact — decide whether to document the scaling in
  the plan or drop it.
