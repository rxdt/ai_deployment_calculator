# Frontend Refactor Spec

PRIORITY 1

## Goal

Refactor the Vite frontend into the calculator users actually use first: multi-family, short main form, local TypeScript calculations, clear outputs, and no required `/api/report`.

## Source

This spec derives from `docs/plan.md`. Keep the old public names:

```txt
Workload Family; Text generation / chat; Text embeddings / reranking / classification; Encoder-decoder generation; Vision understanding; Vision-language / multimodal; Image generation / diffusion; Video generation; Speech / audio; Tabular / classical ML; Custom / unknown; Known Model File Size; Compare with my GPU; Total Resident Parameters; Precision; Execution Mode; Runtime Profile; Advanced assumptions.
```

Do not rename these to addendum names like `Model Family`, `LLM / text generation`, or `Known Resident Model Size`.

## Frontend Ownership

- Calculation source of truth is frontend TypeScript.
- Frontend must normalize state, call local `buildReport(state)`, and render the result.
- Do not require `/api/report`, fetch mocks for `/api/report`, WSGI, or Python formula logic.
- There is no Python/FastAPI backend; the app is a static Vite bundle served by any static host.
- Keep code small and focused. Prefer `types.ts`, `state.ts`, `families.ts`, `calculator.ts`, `hardware.ts`, `report.ts`, `render.ts`, `validation.ts`, `app.ts` if those fit the codebase.

## Main UI

Default state must fit on one desktop viewport. Show only:

```txt
Workload Family; Total Resident Parameters; Parameter Unit; Precision; Execution Mode; Runtime Profile; adaptive Input Size; adaptive Workload Size; MoE Model checkbox only when relevant.
```

Hide rare controls under `<details><summary>Advanced assumptions</summary>`.

Use semantic HTML (`main`, `header`, `section`, `form`, `label`, `button`, `output`, `details`, `summary`). Every input needs a real label. No clickable divs. Warnings need visible text.

## Visible Fields

- `Workload Family`: dropdown default `Text generation / chat`; options are the names in Source.
- `Total Resident Parameters`: integer default `7`; validation `>= 1`.
- `Parameter Unit`: dropdown `B`, `M`, `K`; multipliers `1`, `0.001`, `0.000001`.
- `Precision`: dropdown `4-bit`, `5-bit GGUF`, `6-bit GGUF`, `8-bit`, `16-bit`, `32-bit`; default `16-bit`.
- Precision map: `4-bit .5/1.15`, `5-bit .625/1.12`, `6-bit .75/1.10`, `8-bit 1/1.05`, `16-bit 2/1`, `32-bit 4/1` as `weight_bytes/weight_overhead`.
- `Execution Mode`: dropdown `Inference`, `LoRA fine-tuning`, `QLoRA fine-tuning`, `Full training`; do not use separate Training/LoRA checkboxes.
- `Runtime Profile`: dropdown `Local / Edge`, `Server / Cloud`; training modes force training runtime assumptions.
- Runtime map: Local `0.5 GB`, buffer `1.05`, utilization `0.90`; Server `1.5 GB`, buffer `1.10`, utilization `0.85`; Training override `4.0 GB`, buffer `1.25`, utilization `0.80`.
- Adaptive Input Size: text gen `Context Window=8000`; embeddings `Sequence Length=512`; encoder-decoder `Input Tokens=1024`, `Output Tokens=256`; vision `Image Size`; multimodal `Text Context Tokens=4000` + `Image Size`; diffusion `Output Image Size`; video `Output Resolution=720p` + `Frames=81`; audio `Audio Length=30`; tabular `Rows per Batch=10000` + `Features=100`; custom `Input Size Preset`.
- Workload Size: inference label `Concurrent Requests`, default `1`; training label `Micro Batch Size`, default `1`; never label this `Batch Size`.
- MoE checkbox appears only for text generation, embeddings/reranking/classification, encoder-decoder, multimodal, and custom. `Active Parameters` appears only when checked and does not reduce resident weight memory unless expert offload/sharding is enabled.

## Advanced Controls

Include optional controls for: Known Model File Size, GPU Resident Fraction, KV Cache Precision, Exact Transformer Architecture, Pipeline Component Parameters, Training Settings, Vision/Diffusion/Video Settings, Audio Tokens per Second, Feature Bytes, Parallelism/Sharding, Runtime Override, Compare with my GPU, Cloud Cost Override.

KV Cache Precision appears only for generative transformer families and offers `16-bit` (`kv_bytes=2`) and `8-bit / FP8` (`kv_bytes=1`).

## Required Outputs

Show: `Total Required Memory`, `Recommended Hardware`, `Minimum Raw VRAM Needed`, workload-specific speed, cloud cost only for `Server / Cloud`, and `Accuracy`.

Breakdown rows: `Model / pipeline weights`, `KV cache`, `Input / activation memory`, `Training state`, `Runtime overhead`, `Safety buffer`. Hide zero rows. Never use generic `Task overhead`.

Recommended Hardware must include: required memory, usable VRAM target, and minimum raw VRAM math. Do not output only a GPU model name.

Accuracy values: `File-size based`, `Component-based`, `Advanced override`, `Estimated`, `Rough`.

## Required Warnings

Always show the standard heuristic warning from `docs/plan.md`. Add conditional warnings for estimated architecture, diffusion/video, MoE, training, local offload, tabular, vision, and audio as applicable.

## Tests

Unit coverage must include conversion, precision map, Known Model File Size override, MoE resident memory, decoder KV scaling, no encoder KV, encoder-decoder memory, diffusion/video/audio/tabular scaling, LoRA, QLoRA, full training, hardware recommendation, confidence, and cloud visibility.

Expected corrected outputs use: Text generation / chat, concurrency 1, Server / Cloud unless local/GGUF stated, Server overhead `1.5` buffer `1.10`, Local GGUF overhead `0.5` buffer `1.00`, Training overhead `4.0` buffer `1.25`, checkpointing on, activation factor `3`, AdamW, LoRA default `0.5%` unless stated, estimated GQA KV, decoder scratch `0`.

| Case                                                                   |                       Old |                                                 Correct |
| ---------------------------------------------------------------------- | ------------------------: | ------------------------------------------------------: |
| `47B`, `8000 ctx`, MoE `active=1.3`, `16-bit`, `16-bit KV`             |                   `106.5` |                                              `107.9 GB` |
| `8B`, `8000 ctx`, `16-bit`, QLoRA, `2% trainable`                      |                    `21.7` |                                               `21.0 GB` |
| `8B`, `8000 ctx`, defaults                                             |                    `20.1` |                                               `20.4 GB` |
| `7B`, `8000 ctx`, full training                                        |                   `141.0` |                                              `152.9 GB` |
| `104B`, `32000 ctx`, `4-bit`, `32-bit KV`, local GGUF `52 GB`          |                   `136.7` |                                               `77.7 GB` |
| `47B`, `8000 ctx`, `4-bit`, MoE `active=1.3`, local GGUF               |                    `26.3` |                                               `26.6 GB` |
| `0.0004B`, `8000 ctx`, `8-bit`, `8-bit KV`, full training              |                     `1.7` |                                                `5.1 GB` |
| `70B`, `128000 ctx`, `4-bit`, `8-bit KV`                               |                   `101.8` |                 `69.0 GB`; `63.2 GB` with exact `35 GB` |
| `104B`, `32000 ctx`, `8-bit`, `16-bit KV`                              |                   `161.8` |                 `135.6 GB`; `129.9 GB` without overhead |
| `7B`, `1,000,000 ctx`, `8-bit`, `16-bit KV`                            |                   `105.6` |                           `153.9 GB` with estimated GQA |
| `8B`, `8000 ctx`, `4-bit`, QLoRA                                       |                    `11.3` |                                               `19.2 GB` |
| `70B`, `8000 ctx`, `4-bit`, QLoRA                                      |                    `52.3` |                                               `99.9 GB` |
| `3.8B`, `8000 ctx`, `4-bit`, QLoRA                                     |                     `8.6` |                                               `13.2 GB` |
| `8B`, `8000 ctx`, precision `32/16/8/4-bit`                            |      `37.7/20.1/11.3/6.9` |                                 `38.0/20.4/12.0/7.9 GB` |
| `104B`, `32000 ctx`, `32-bit KV`, local GGUF precision comparison      | `500.7/292.7/188.7/136.7` |                             `441.7/233.7/129.7/77.7 GB` |
| `70B`, `8000 ctx`, `4-bit`, `8-bit KV`, `trained=on`, `use_adapter=on` |                    `48.4` | invalid; use `Execution Mode`; QLoRA `2%` is `115.6 GB` |

Do not use `trained=on` and `use_adapter=on` in corrected tests. If old UI numbers must remain, isolate them in `legacyHeuristicFormula.test.ts`.

Checks: `npm --prefix frontend run build`, `npm --prefix frontend run test:coverage`, `npm --prefix frontend run test:e2e`, `npm --prefix frontend run gate`.
