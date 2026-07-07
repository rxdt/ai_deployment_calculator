# Frontend Spec

PRIORITY - frontend parity and UI compaction implemented; keep green. Responsive standards met. Frontend best practices implemented.
**Styling is the very LAST thing implemented.**

## Current Contract

- The Vite app is static.
- `CalculatorApp` normalizes form state, calls local TypeScript
  `buildReport(state)`, and renders synchronously.
- Public UI names follow the Naming Contract in `specs/plan.md`; do not redefine
  them here.

## UI State

- Main form shows `Workload Family`, `Total Model Parameters`,
  `Parameter Unit`, `Precision`, `Execution Mode`, `Runtime Profile`,
  adaptive input controls, adaptive workload size, and relevant `MoE Model`.
- Rare controls live in `<details><summary>Advanced assumptions</summary>`.
- `KV Cache Precision` lives in advanced assumptions, is visible only for
  inference decoder-KV workloads, and offers `8-bit / FP8`, `16-bit`, and
  `32-bit`.
- Workload size label is `Concurrent Requests` for inference and
  `Micro Batch Size` for training; never reintroduce generic `Batch Size`.
- `MoE Model` appears only for text generation, embeddings, encoder-decoder,
  multimodal, and custom. `Active Parameters` appears only when checked.
- Changing workload family or execution mode rerenders adaptive controls without
  waiting for form submit.
- ZERO STYLING UNTIL ALL JAVASCRIPT AND HTML WORK IS EXHAUSTED!

## Calculation State

- `frontend/src/calculator-core.ts`, `workload-memory.ts`, and `hardware.ts` own
  the calculation; `report.ts` assembles the rendered report. The canonical
  equation, presets, per-family formulas, and hardware/speed math are detailed in
  the Formulas section below.
- `Known Model File Size` overrides parameter-based weight estimates; MoE active
  parameters affect speed/KV only, not resident weight memory; training modes use
  adapter/full-training state plus checkpointed activations; legacy
  `trained=on&use_adapter=on` query flags are ignored.

## Outputs

- First glance (hero): `Estimated VRAM Required` (the total), a short
  "The workload needs N GB usable VRAM." line, and `Recommended GPU Class`
  (e.g. `24 GB GPU hardware tier`). Nothing else is shown by default.
- Collapsed `<details>` panels hold the rest:
  - `Why this recommendation` — a plain-language "why" sentence plus
    `Minimum GPU VRAM Capacity`, `Usable VRAM Target`,
    `Usable VRAM on Recommended Class`, `Fit Headroom`, and `Estimated Speed`
    (rendered as `tokens/sec`).
  - `Calculation used` — the per-component breakdown rows (`Model memory` or
    `QLoRA base model memory`, `Context memory`, `Activation memory`,
    `Training memory`, `Runtime reserve`, `Safety margin`), the inline formula,
    and the assumptions list. Rows that round to `0.0 GB` are hidden.
- The hardware-recommendation and fit math (usable VRAM on class, fit headroom,
  overflow `n/a`, speed) is defined in the Formulas section below.
- Warnings are conditional only: estimated architecture, diffusion/video, MoE,
  training, local offload, tabular, vision, and audio. The always-on "standard
  heuristic" disclaimer has been removed; default inference renders no warnings.
- There is no `Accuracy` output and no separate `Your GPU Fit` panel; both were
  removed by product decision.

## Tests And Checks

- Unit tests pin corrected totals: `47B` MoE `113.1 GB`, default `8B`
  `21.3 GB`, `7B` full training `152.9 GB`, local exact `104B` `79.2 GB`,
  QLoRA defaults and `2%` cases, long-context GQA KV, and precision comparison.
- Unit tests cover conversion, precision map, file-size override, MoE resident
  memory, decoder KV scaling, no encoder KV, encoder-decoder memory,
  diffusion/video/audio/tabular scaling, LoRA, QLoRA, full training, hardware
  tier matching (single-GPU vs sharded, overflow), tier-bandwidth speed,
  confidence, and legacy flag removal.
- Playwright covers accessibility, local report rendering, adaptive controls,
  no generic `Batch Size`, MoE visibility, and escaping.
- App unit tests cover the real HTML `KV Cache Precision` options and the
  rendered 32-bit KV estimate.
- `frontend/src/legacy-approximations.test.ts` was deleted; do not reintroduce
  it or any legacy-approximation test.
- Required commands: `npm --prefix frontend run build`,
  `npm --prefix frontend run test:coverage`,
  `npm --prefix frontend run test:e2e`, `npm --prefix frontend run gate`,
  `.venv/bin/harness gate`, `harness preflight`.

## Open Parity Gaps (code review)

Gaps #1-#4 and minor parity items are closed and verified plan-conformant by
code review (expected values hand-recomputed from `docs/plan.md`). No reviewed
frontend calculation parity gaps remain.

## Formulas

This is the canonical, implemented formula reference. Variable names and constants below match `frontend/src/calculator-core.ts`,
`workload-memory.ts`, and `hardware.ts`.


## Canonical VRAM Formula

There is one base equation:

`Required_GB = (Weights_GB + Working_Memory_GB + Training_State_GB + Runtime_Overhead_GB) * Buffer`

Where:

`Weights_GB` = model or pipeline weights resident in GPU memory.

`Working_Memory_GB` = runtime memory that depends on workload: KV cache, activations, image/video/audio tensors, scratch memory.

`Training_State_GB` = optimizer state, gradients, trainable adapters, and master weights when training/fine-tuning.

`Runtime_Overhead_GB` = CUDA/framework/runtime tax.

`Buffer` = safety multiplier.

Display:

`Safety_Buffer_GB = (Weights_GB + Working_Memory_GB + Training_State_GB + Runtime_Overhead_GB) * (Buffer - 1)`

`Required_GB = round(Required_GB, 1)`

---

## Unit Conversion

`Total_Params_B = input_value * unit_multiplier`

`unit_multiplier = 1` for billions (`B`).

`unit_multiplier = 0.001` for millions (`M`).

The UI exposes only `B` and `M` (`ParameterUnit = "B" | "M"`).

---

## Weight Memory

Default:

`Weights_GB = Resident_Params_B * Weight_Bytes * Weight_Overhead`

If exact file size is supplied:

`Weights_GB = Known_Model_Size_GB * GPU_Resident_Fraction`

Precision presets:

`32-bit: Weight_Bytes = 4, Weight_Overhead = 1.00`

`16-bit: Weight_Bytes = 2, Weight_Overhead = 1.00`

`8-bit: Weight_Bytes = 1, Weight_Overhead = 1.05`

`6-bit GGUF: Weight_Bytes = 0.75, Weight_Overhead = 1.10`

`5-bit GGUF: Weight_Bytes = 0.625, Weight_Overhead = 1.12`

`4-bit: Weight_Bytes = 0.5, Weight_Overhead = 1.15`

---

## Runtime Presets

Local / Edge:

`Runtime_Overhead_GB = 0.5`

`Buffer = 1.00`

`GPU_Utilization_Target = 0.90`

Server / Cloud:

`Runtime_Overhead_GB = 1.5`

`Buffer = 1.10`

`GPU_Utilization_Target = 0.85`

Training / fine-tuning override:

`Runtime_Overhead_GB = 4.0`

`Buffer = 1.25`

`GPU_Utilization_Target = 0.80`

---

## Architecture Buckets

Estimated transformer architecture by total parameter count:

```txt
<= 1B:   layers 16, hidden 2048, heads 32, kv_heads 8, head_dim 64
<= 4B:   layers 28, hidden 3072, heads 24, kv_heads 8, head_dim 128
<= 10B:  layers 32, hidden 4096, heads 32, kv_heads 8, head_dim 128
<= 20B:  layers 40, hidden 5120, heads 40, kv_heads 8, head_dim 128
<= 40B:  layers 48, hidden 6144, heads 48, kv_heads 8, head_dim 128
<= 80B:  layers 80, hidden 8192, heads 64, kv_heads 8, head_dim 128
<= 160B: layers 96, hidden 10240, heads 80, kv_heads 8, head_dim 128
> 160B:  layers 120, hidden 12288, heads 96, kv_heads 8, head_dim 128
```


Also compute `conservative_kv_heads = attention_heads` and show it in advanced
output.

---

## Training Defaults

```txt
AdamW optimizer_bytes = 8
8-bit Adam optimizer_bytes = 2
SGD-like optimizer_bytes = 4
gradient_bytes = 2
activation_bytes = 2
master_weight_bytes = 4
adapter_weight_bytes = 2
gradient_checkpointing checked -> activation_factor_training = 3
gradient_checkpointing unchecked -> activation_factor_training = 8
lora_trainable_percent options = 0.1%, 0.5%, 1%, 2%
```

---

## LLM / Text Generation Formula

Use this for decoder/chat/autoregressive generation.

`KV_GB = Concurrent_Requests * Context_Tokens * 2 * Num_Layers * Num_KV_Heads * Head_Dim * KV_Bytes / 1e9`

`Decoder_Scratch_GB = Weights_GB * Decoder_Scratch_Ratio`

`Decoder_Scratch_Ratio = 0.03` for Local / Edge.

`Decoder_Scratch_Ratio = 0.05` for Server / Cloud.

`Working_Memory_GB = KV_GB + Decoder_Scratch_GB`

For a simpler deterministic test mode, set:

`Decoder_Scratch_GB = 0`

---

## Text Encoder Formula

Use this for embeddings, rerankers, classifiers.

`Encoder_Activation_GB = Activation_Factor_Inference * Concurrent_Requests * Sequence_Tokens * Num_Layers * Hidden_Size * Activation_Bytes / 1e9`

`Working_Memory_GB = Encoder_Activation_GB`

Default:

`Activation_Factor_Inference = 2`

`Activation_Bytes = 2`

No persistent KV cache.

---

## Encoder-Decoder Formula

Use this for translation, summarization, T5-style generation.

`Encoder_Activation_GB = Activation_Factor_Inference * Concurrent_Requests * Input_Tokens * Num_Layers * Hidden_Size * Activation_Bytes / 1e9`

`Decoder_KV_GB = Concurrent_Requests * Output_Tokens * 2 * Num_Layers * Num_KV_Heads * Head_Dim * KV_Bytes / 1e9`

`Cross_Attention_Scratch_GB = Weights_GB * 0.05`

`Working_Memory_GB = Encoder_Activation_GB + Decoder_KV_GB + Cross_Attention_Scratch_GB`

---

## Vision Formula

Use this for ViT-like vision models.

`Image_Tokens = ceil(Image_Width / Patch_Size) * ceil(Image_Height / Patch_Size) + 1`

`Vision_Transformer_Working_GB = Activation_Factor_Inference * Concurrent_Requests * Image_Tokens * Num_Layers * Hidden_Size * Activation_Bytes / 1e9`

Fallback pixel proxy:

`Vision_Pixel_Proxy_GB = Concurrent_Requests * Image_Width * Image_Height * Vision_Channels * Activation_Bytes * Vision_Activation_Multiplier / 1e9`

Defaults:

`Patch_Size = 16`

`Vision_Channels = 4`

`Vision_Activation_Multiplier = 8`

Final:

`Working_Memory_GB = max(Vision_Transformer_Working_GB, Vision_Pixel_Proxy_GB)`

---

## Vision-Language / Multimodal Formula

`Image_Tokens = Image_Count * ceil(Image_Width / Patch_Size) * ceil(Image_Height / Patch_Size)`

`Effective_Context_Tokens = Text_Tokens + Image_Tokens`

`Multimodal_KV_GB = Concurrent_Requests * Effective_Context_Tokens * 2 * Num_Layers * Num_KV_Heads * Head_Dim * KV_Bytes / 1e9`

`Multimodal_Vision_Working_GB = Activation_Factor_Inference * Concurrent_Requests * Image_Tokens * Vision_Layers * Vision_Hidden_Size * Activation_Bytes / 1e9`

If the vision architecture is unknown, the fallback pixel proxy uses one image's
pixels; `Image_Count` still scales multimodal tokens, KV, and explicit vision
architecture activations.

`Projector_Scratch_GB = Weights_GB * 0.02`

`Working_Memory_GB = Multimodal_KV_GB + Multimodal_Vision_Working_GB + Projector_Scratch_GB`

---

## Image Diffusion Formula

`Latent_Height = ceil(Output_Image_Height / Latent_Downsample)`

`Latent_Width = ceil(Output_Image_Width / Latent_Downsample)`

`Diffusion_Latent_GB = Concurrent_Requests * Latent_Height * Latent_Width * Latent_Channels * Activation_Bytes / 1e9`

`Working_Memory_GB = max(Diffusion_Latent_GB * Diffusion_Activation_Multiplier, Weights_GB * Diffusion_Weight_Peak_Ratio)`

Defaults:

`Latent_Downsample = 8`

`Latent_Channels = 4`

`Diffusion_Activation_Multiplier = 64`

`Diffusion_Weight_Peak_Ratio = 0.35`

---

## Video Generation Formula

`Latent_Height = ceil(Video_Height / Latent_Downsample)`

`Latent_Width = ceil(Video_Width / Latent_Downsample)`

`Latent_Frames = ceil(Frames / Temporal_Downsample)`

`Video_Latent_GB = Concurrent_Requests * Latent_Frames * Latent_Height * Latent_Width * Latent_Channels * Activation_Bytes / 1e9`

`Working_Memory_GB = max(Video_Latent_GB * Video_Activation_Multiplier, Weights_GB * Video_Weight_Peak_Ratio)`

Defaults:

`Temporal_Downsample = 4`

`Video_Activation_Multiplier = 96`

`Video_Weight_Peak_Ratio = 0.50`

---

## Audio Formula

`Audio_Tokens = Audio_Seconds * Audio_Tokens_Per_Second`

`Working_Memory_GB = Activation_Factor_Inference * Concurrent_Requests * Audio_Tokens * Num_Layers * Hidden_Size * Activation_Bytes / 1e9`

Default:

`Audio_Tokens_Per_Second = 50`

---

## Tabular Formula

`Tabular_Batch_GB = Rows_Per_Batch * Features * Feature_Bytes / 1e9`

`Working_Memory_GB = Tabular_Batch_GB * Tabular_Working_Multiplier`

Defaults:

`Feature_Bytes = 4`

`Tabular_Working_Multiplier = 4`

---

## Custom / Unknown Formula

`Working_Memory_GB = Weights_GB * Custom_Working_Multiplier * Input_Size_Multiplier`

Defaults:

`Custom_Working_Multiplier = 0.25`

`Input_Size_Multiplier = 1.0`

---

## LoRA Formula

`Adapter_Params_B = Total_Params_B * LoRA_Trainable_Percent / 100`

`Training_State_GB = Adapter_Params_B * (Adapter_Weight_Bytes + Gradient_Bytes + Optimizer_Bytes)`

Defaults:

`LoRA_Trainable_Percent = 0.5`

`Adapter_Weight_Bytes = 2`

`Gradient_Bytes = 2`

`Optimizer_Bytes = 8` for AdamW.

---

## QLoRA Formula

QLoRA forces the frozen base model to 4-bit.

`Weights_GB = Resident_Params_B * 0.5 * 1.15`

`Adapter_Params_B = Total_Params_B * LoRA_Trainable_Percent / 100`

`Training_State_GB = Adapter_Params_B * (Adapter_Weight_Bytes + Gradient_Bytes + Optimizer_Bytes)`

Do not use flat `4 GB` QLoRA overhead.

---

## Full Training Formula

`Weights_GB = Total_Params_B * Weight_Bytes`

`Training_State_GB = Total_Params_B * (Master_Weight_Bytes + Gradient_Bytes + Optimizer_Bytes)`

Defaults:

`Master_Weight_Bytes = 4`

`Gradient_Bytes = 2`

`Optimizer_Bytes = 8` for AdamW.

Do not use `Total_Params_B * 16` as the final formula. That is only a rough parameter-state shortcut and still misses activations, runtime overhead, and buffer.

---

## Training Activation Formula

Use this for LoRA, QLoRA, and Full Training.

`Training_Activation_GB = Activation_Factor_Training * Micro_Batch_Size * Sequence_Or_Token_Count * Num_Layers * Hidden_Size * Activation_Bytes / 1e9`

Then:

`Working_Memory_GB = Family_Working_Memory_GB + Training_Activation_GB`

Defaults:

`Activation_Factor_Training = 3` if gradient checkpointing is on.

`Activation_Factor_Training = 8` if gradient checkpointing is off.

`Activation_Bytes = 2`

---

## MoE Rule

`Resident_Params_B = Total_Params_B`

`Active_Params_B = Active_Params_Input_B if MoE enabled else Total_Params_B`

Active parameters affect rough speed estimates only.

They do not reduce weight memory unless expert offload or sharding is explicitly enabled.

---

## Hardware Recommendation

`Minimum_Raw_VRAM_GB = Required_GB / GPU_Utilization_Target`

`Recommended_Tier = smallest eligible tier where Tier_VRAM_GB >= Minimum_Raw_VRAM_GB`

The single canonical tier table is `HARDWARE_TIERS` in `frontend/src/hardware.ts`.
Each tier carries `vramGb`, `label`, `examples`, `bandwidthGbps`, `kind`,
`gpuCount`, and `requiresSharding`. The 141 GB (H200) and 180 GB (B200) tiers are
single-GPU; only the 160 GB and 320 GB aggregate tiers set `requiresSharding` and
are eligible only when `memory_sharding_enabled` is on:

|    VRAM | Primary label                            | Examples                              | Speed bandwidth | Sharding |
| ------: | ---------------------------------------- | ------------------------------------- | --------------: | -------- |
|    8 GB | 8 GB consumer class                      | RTX 4060 / older 8 GB GPUs            |        272 GB/s | No       |
|   12 GB | 12 GB consumer class                     | RTX 3060 / RTX 4070 class             |        504 GB/s | No       |
|   16 GB | 16 GB consumer / small workstation class | RTX 4080 / RTX 5000 Ada class         |        448 GB/s | No       |
|   24 GB | 24 GB high-end consumer class            | RTX 3090 / RTX 4090 class             |        936 GB/s | No       |
|   48 GB | 48 GB workstation / pro inference class  | RTX A6000 / RTX 6000 Ada / L40S class |        768 GB/s | No       |
|   80 GB | 80 GB datacenter class                   | A100 / H100 / H800 class              |       2039 GB/s | No       |
|  141 GB | 141 GB datacenter class                  | H200 class                            |       4800 GB/s | No       |
|  160 GB | 160 GB sharded datacenter class          | 2x 80 GB GPUs                         |       4078 GB/s | Yes      |
|  180 GB | 180 GB datacenter class                  | B200 class                            |       8000 GB/s | No       |
|  320 GB | 320 GB sharded datacenter class          | 4x 80 GB GPUs                         |       8156 GB/s | Yes      |
| >320 GB | Distributed / offload required           | Multi-node or larger GPU pool         |             N/A | Yes      |

When nothing eligible fits, return overflow: "No single-GPU fit. Enable memory
sharding or use offload." below 320 GB raw, otherwise "> 320 GB: distributed
multi-node, larger GPU pool, or heavy offload".

Display `fit headroom`.

`Usable_VRAM_GB = Recommended_Tier_VRAM_GB * GPU_Utilization_Target`

`Fit_Headroom_GB = Usable_VRAM_GB - Required_GB`

For the recommended tier `Fit_Headroom_GB >= 0` by construction. Overflow and the
empty workload report `n/a` for usable VRAM and fit headroom.

Compare-with-my-GPU (advisory only; `my_gpu_vram_gb`):

`My_Usable_VRAM_GB = My_GPU_Raw_VRAM_GB * GPU_Utilization_Target`

`Fits_My_GPU = Required_GB <= My_Usable_VRAM_GB`

Today this only adds the Local / Edge offload warning when a GPU is entered; the
report does not yet surface a separate `Fits_My_GPU` value.

---

## Speed Estimate

For dense models:

`Compute_Weight_GB = Weights_GB`

For MoE models:

`Compute_Weight_GB = Active_Params_B * Weight_Bytes * Weight_Overhead`

Text generation speed:

`Tokens_Per_Second = Recommended_Tier_Bandwidth_GBps / Compute_Weight_GB`

Bandwidth comes from the recommended tier in `HARDWARE_TIERS`, not a global
constant. On overflow, use the largest tier's bandwidth. This is rough only.

---

## Do Not Restore These Old Formulas

Do not use:

`KV_GB = Active_Params_B / 10`

`KV_GB = (Active_Params_B / 10) * (Context_Tokens / 8000) * (KV_Bits / 16)`

`QLoRA_Overhead_GB = 4`

`Full_Training_GB = Total_Params_B * 16`

`Required_GB = (Weights + KV + Task_Overhead + Runtime_Tax) * Buffer` as the real internal model

The simpler equation can appear only as a simplified explanation if its labels map to the canonical terms.

## Canonical test cases

Expected values below are **scratch-included** (the product default: inference
totals carry `decoder_scratch_gb = weights * 0.05 server / 0.03 local`). They
match the implemented, passing assertions in `frontend/src/calculator.test.ts`.
The earlier scratch-zero figures (e.g. 8B = 20.4) are retained only as the
`scratch-zero comparison` column and are exercised only by component-level unit
tests that isolate the KV equation. Delete a row only after its scratch-included
test exists.

Case	Status	Scratch-included expected (implemented)	Scratch-zero comparison
47B, 8000 ctx, MoE active=1.3, 16-bit weights, 16-bit KV	Done. Active params drive neither KV nor weights.	113.1 GB	107.9 GB
8B, 8000 ctx, 16-bit weights, QLoRA, 2% trainable	Done. Training mode adds no decoder scratch.	21.0 GB	21.0 GB
8B, 8000 ctx, defaults	Done. Architecture KV + server decoder scratch.	21.3 GB	20.4 GB
7B, 8000 ctx, full training	Done. No decoder scratch in training.	152.9 GB	152.9 GB
104B, 32000 ctx, 4-bit, 32-bit KV, llama_cpp_gguf (52 GB exact)	Done. Local overhead + file-size override.	79.2 GB	77.7 GB
0.0004B, 8000 ctx, 8-bit weights, 8-bit KV, full training	Done. Training overhead dominates.	7.0 GB	5.1 GB
70B, 128000 ctx, 4-bit weights, 8-bit KV	Done. Estimated GQA KV; exact uses 35 GB resident.	71.2 GB generic, 65.1 GB exact 35 GB	69.0 / 63.2 GB
104B, 32000 ctx, 8-bit weights, 16-bit KV	Done.	141.6 GB	135.6 GB
7B, 1,000,000 ctx, 8-bit weights, 16-bit KV	Done. Estimated GQA at 1M context.	154.3 GB	153.9 GB
8B, 8000 ctx, 4-bit weights, QLoRA	Done.	19.2 GB	19.2 GB
70B, 8000 ctx, 4-bit weights, QLoRA	Done.	99.9 GB	99.9 GB
3.8B, 8000 ctx, 4-bit weights, QLoRA	Done. <=4B architecture bucket.	13.2 GB	13.2 GB
8B, 8000 ctx, precision comparison 32/16/8/4-bit	Done.	39.8 / 21.3 / 12.5 / 8.1 GB	38.0 / 20.4 / 12.0 / 7.9 GB
104B, 32000 ctx, 32-bit KV, local, parameter-derived precision comparison	Done. Replaces the underspecified gguf-exact sweep (which required one known file size per precision). Generic parameter-derived sweep instead.	454.1 / 239.9 / 138.1 / 87.3 GB	n/a (no scratch-zero variant tested)
70B, 8000 ctx, 4-bit, 8-bit KV, QLoRA 2% (replaces trained=on&use_adapter=on)	Done. Booleans replaced by Execution Mode.	115.6 GB	115.6 GB


Ensure frontend has:

execution mode = inference | lora finetune | qlora finetune | full training

### Keep these as the core smoke tests:

Values are scratch-included (product default), matching calculator.test.ts.

8B LLM inference, 8000 ctx, 16-bit weights, 16-bit KV, server:
expected = 21.3 GB (scratch-zero comparison: 20.4 GB)
47B MoE LLM inference, active=1.3B, 8000 ctx, 16-bit:
expected = 113.1 GB (scratch-zero comparison: 107.9 GB)
assert active params do not reduce weight memory
8B QLoRA fine-tuning, 8000 sequence, 2% trainable:
expected = 21.0 GB
assert no flat 4 GB QLoRA overhead
7B full training, 8000 sequence:
expected = 152.9 GB
assert includes weights + master weights + gradients + optimizer + activations
104B GGUF local, exact resident size 52GB, 32000 ctx, 32-bit KV:
expected = 79.2 GB (scratch-zero comparison: 77.7 GB)
assert known file size overrides parameter-derived weight estimate

## Design Direction (styling phase, not yet implemented)

Styling is deferred; `styles.css` currently holds only a box-sizing reset. When
the visual pass happens, follow this direction. It describes presentation only —
no calculation, markup-structure, or label changes (those are fixed above).

Hierarchy:

- One dominant result (the hero VRAM number + recommended GPU class). Everything
  else is demoted: a couple of glanceable numbers, then collapsed `<details>`
  for the breakdown, why, assumptions, and warnings. Avoid the "debug dashboard"
  look where every value has equal weight.

Layout:

- Desktop: two panes (inputs and results) that fit 1440x900 without page scroll.
- Narrow widths: a clean single-column flow. Do not force a no-scroll mobile by
  cramming; that would be a behavior change.

Typography:

- Sans (Geist / system-ui) for headings, result values, and body text.
- JetBrains Mono only for HUD/section labels, formulas, code, terminal/status
  text, and form inputs. Result numbers use `font-variant-numeric: tabular-nums`.

Color:

- Near-black background; off-white text; muted gray-green secondary text.
- Reserve the bright green accent for the final answer and status; use softer
  gray-green for labels and borders. Keep any grid/glow subtle.

Spacing and shape:

- Panel padding ~24px, card padding ~16px; card radius 12-14px, input/button
  radius 8px; dominant gaps 16/24px; input min-height ~44-52px.

Accessibility:

- Preserve every test-pinned accessible name and the `aria-label` regions the
  Playwright suite asserts. The styling pass must keep axe violations at zero and
  meet the touch-target (>=40px) and readable-text (>=13px) checks in
  `tests/responsive.spec.ts`.
