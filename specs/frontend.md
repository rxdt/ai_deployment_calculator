# Frontend Refactor Spec

PRIORITY 1 - frontend parity and UI compaction implemented; keep green.

## Current Contract

- The Vite app is static. There is no required report-service route, Python
  formula source, or fetch mock.
- `CalculatorApp` normalizes form state, calls local TypeScript
  `buildReport(state)`, and renders synchronously.
- Public UI names follow the Naming Contract in `specs/plan.md`; do not redefine
  them here.

## UI State

- Main form shows `Workload Family`, `Total Model Parameters`,
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

## Formulas

This is the canonical, implemented formula reference. It supersedes any older
`/api/report` migration language or legacy heuristic examples (those are gone).
Variable names and constants below match `frontend/src/calculator-core.ts`,
`workload-memory.ts`, and `hardware.ts`.

```md
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

The old display equation can appear only as a simplified explanation if its labels map to the canonical terms.
```


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


RAM calculator should follow that pattern: fewer visible controls, one dominant result, compact supporting metrics, technical details hidden/collapsed.

Main problem: the current UI looks like a debug dashboard. Everything has equal weight: total VRAM, raw VRAM, safety buffer, runtime overhead, speed, hardware text, assumptions, warnings, advanced fields. That creates scroll and makes the result feel less trustworthy.

Target desktop layout:

48px terminal/status bar

[ left: results 1fr ] 24px gap [ right: inputs 400-420px ]

Left:
  hero result card
  3-4 compact breakdown cards
  compact recommendation strip
  collapsed/short assumptions

Right:
  title
  Model group
  Deployment group
  Workload shape group
  Advanced assumptions collapsed
  Calculate button

Hard rule: no visible hardware lists. Keep the aria-label="Hardware recommendations" section for tests, but make it a compact line, not a table/list:

Fits target: 16 GB VRAM class
Usable target: 80%

Same for quantization. Keep aria-label="Quantization comparison", but show compact precision chips or collapse it. Do not show a full table in the first viewport.

Spacing changes:

.terminal-bar {
  height: 48px;
  padding: 0 24px;
}

main {
  height: calc(100dvh - 48px);
  max-width: 1440px;
  margin: 0 auto;
  padding: 16px 24px 24px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  gap: 24px;
  overflow: hidden;
}

.results,
.controls {
  min-height: 0;
}

.hud-panel,
.metric-card,
.form-panel {
  border-radius: 12px;
  padding: 16px;
}

.results {
  display: grid;
  grid-template-rows: auto auto auto 1fr;
  gap: 16px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.total-card {
  min-height: 128px;
  padding: 24px;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
}

.controls form {
  display: grid;
  gap: 16px;
}

.field-group {
  display: grid;
  gap: 12px;
}

.field-row {
  display: grid;
  gap: 12px;
}

.field-row.two {
  grid-template-columns: 1fr 96px;
}

input,
select,
button {
  min-height: 44px;
  padding: 10px 12px;
  border-radius: 8px;
}

Typography: stop using mono for everything. Use Geist for headings, result values, body text. Use JetBrains Mono only for HUD labels, formulas, small terminal/status text, and code-like values.

body {
  font-family: "Geist Variable", Inter, system-ui, sans-serif;
}

.hud-label,
.terminal-bar,
.formula,
code,
input,
select {
  font-family: "JetBrains Mono", ui-monospace, monospace;
}

h1,
.total,
.metric-value {
  font-family: "Geist Variable", Inter, system-ui, sans-serif;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}

.hud-label {
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.metric-label,
.field-help {
  font-size: 0.75rem;
}

Fix the duplicated parameter issue like this:

Always show:
  Parameters (billions)
  Parameter unit

Only show for MoE:
  Active routed parameters

NEVER show “Total resident parameters” as the main label!

Preserve the test-pinned accessible label exactly:

<label for="parameters">Parameters (billions)</label>
<p class="field-help" id="parameters-help">
  Use model-card total params. Example: 7B → 7. For 80M, enter 80 and choose M.
</p>

Helper text must stay outside <label> or the accessible name changes and tests break.

Correct input grouping:

Model
  Workload family
  Parameters (billions) + unit
  Precision

Deployment
  Execution mode
  Runtime profile

Workload shape
  LLM: context tokens, batch/concurrency, KV precision
  Vision/VLM: image width, image height, batch/concurrency
  MoE: active routed parameters
  LoRA/QLoRA: trainable percent, gradient checkpointing

Advanced assumptions
  Known model file size
  GPU resident fraction
  CUDA/system overhead

For “Vision understanding”, do not lead with KV cache unless the selected workload includes a text decoder. Show image width, image height, and batch first. KV precision belongs in advanced for VLMs, not the primary flow.

Result card hierarchy:

Hero:
  11.0 GB
  Required VRAM
  Accuracy: file-size based
  Fits target: 16 GB VRAM class

Breakdown cards:
  Model weights
  Input / KV / activation memory
  Training / adapter memory
  Runtime overhead

Small strip:
  Safety buffer: 2.2 GB
  Raw estimate: 13.8 GB
  Usable target: 80%

Collapsed:
  Formula used
  Assumptions
  Warnings
  Quantization comparison

The current “Speed 291.6 tokens/second” card is risky for non-LLM workloads. Rename it to “Throughput estimate” or hide it outside text-generation workloads.

Mobile: true no-scroll at 390px is unrealistic with all inputs and outputs visible. Under your “don’t change behavior” constraint, make desktop no-scroll and make mobile clean with controlled vertical flow. If strict no-scroll mobile is required, add an Input/Results segmented toggle later; that is a small behavior change.

## TASK

Improve the VRAM calculator UI without changing calculation logic.

Files:
- frontend/src/styles.css
- frontend/src/render.ts only for markup grouping/helper text/conditional visibility
- do not touch app.ts
- do not touch frontend/harness/**

Goals:
1. Desktop 1440x900 must fit without document scroll.
2. Preserve all test-pinned aria-labels and accessible names.
3. Remove visible hardware lists; replace with one compact recommendation strip.
4. Keep Hardware recommendations, Quantization comparison, Assumptions, VRAM breakdown, Deployment inputs, Deployment status sections present for tests.
5. Fix confusing duplicated parameter fields:
   - main field label remains exactly “Parameters (billions)”
   - helper text explains B/M usage outside the label
   - show Active routed parameters only for MoE-style workloads
6. Group inputs into Model, Deployment, Workload shape, Advanced assumptions.
7. Use Geist for headings/values/body; JetBrains Mono only for HUD labels, formulas, terminal text, inputs.
8. Increase card/input padding to 16px.
9. Use 12px radius for cards, 8px for inputs/buttons.
10. Use 16/24px dominant gaps.
11. Collapse or compact formula, assumptions, warnings, hardware, and quantization details.
12. Keep fitpick dark grid/green aesthetic.

Acceptance:
- axe has no violations
- 1440x900 screenshot: no page scroll, right form fully visible, no clipped hardware card
- 390x844 screenshot: clean responsive layout, no horizontal overflow
- no calculation logic changed

### MORE INFO

1. **Design review: actionable fixes**

The current visual style has a good concept: dark terminal, green accent, dense technical dashboard. The execution looks amateur because everything has the same visual weight. The title, labels, result number, cards, tables, and assumptions all compete.

Fix this first:

Use **one primary result card**, not multiple competing blocks. The top card should say:

```text
Total Required Memory
20.1 GB
Recommended: 24 GB GPU tier
```

Then put smaller secondary stats below:

```text
Weights: 16.0 GB
KV cache: 0.8 GB
Runtime overhead: 1.5 GB
Safety buffer: 1.8 GB
```

The input panel is too tall and repetitive. Reduce input height from roughly 64px to 48–52px. Reduce vertical field gaps. Group related inputs. The form currently feels like a mobile form stretched onto desktop.

The typography is too aggressively monospace. Keep monospace for numbers and formulas. Use a clean sans font for labels/body text, or at least reduce the mono weight and letter spacing. All-mono makes it feel like a toy terminal instead of a serious engineering calculator.

The green is overused. Reserve bright green for the final answer, selected row, and status. Use softer gray/green for labels and borders. Right now every green accent screams at the same volume.

The grid background is too visible. Lower opacity by 50–70% or remove it inside cards. It makes the app look busy.

The hardware table is too large for the value it gives. Replace the table with one primary recommendation and a collapsed “All hardware tiers” section.

The assumptions block should be collapsed. Normal users should not see formula internals by default. Engineers can expand it.

The “Calculate” button is unnecessary if results update live. If you keep it, rename it to **Update estimate**. A calculator like this should feel reactive.

1. **Output verification**

For the readable default screenshot, the displayed result is correct **only under the old formula shown in the UI**:

```text
W = 8B * 2 bytes = 16.0 GB
KV = (8 / 10) * (8000 / 8000) * (16 / 16) = 0.8 GB
C = 1.5 GB
Buffer = 1.10

Total = (16.0 + 0.8 + 0.0 + 1.5) * 1.10
Total = 20.13 GB
Displayed = 20.1 GB
```

The precision comparison table is also correct under that same old formula:

```text
32-bit: (32.0 + 0.8 + 1.5) * 1.10 = 37.7 GB
16-bit: (16.0 + 0.8 + 1.5) * 1.10 = 20.1 GB
8-bit:  (8.0  + 0.8 + 1.5) * 1.10 = 11.3 GB
4-bit:  (4.0  + 0.8 + 1.5) * 1.10 = 6.9 GB
```

But it is **not correct under the latest trustworthy spec**. The KV formula should not be `parameters / 10`. KV cache depends on batch/concurrency, sequence length, layer count, KV heads, head dimension, and precision bytes. NVIDIA gives the KV cache structure with key/value factor, layers, heads × head dimension, precision, batch, and sequence length. ([NVIDIA Developer][1])

Using the newer estimated architecture path for an 8B LLM, the default result is closer to:

```text
W = 16.0 GB
KV ≈ 1.05 GB
C = 1.5 GB
Buffer = 1.10

Total = (16.0 + 1.05 + 1.5) * 1.10
Total ≈ 20.4 GB
```

So the current `20.1 GB` is internally consistent with the old app, but it should become about `20.4 GB` if you implement the corrected architecture-based KV estimate.

`Base KV Cache = Active_P / 10`, `QLoRA = 4 GB flat`, and `Full Training = Total_P * 16` is old. Those should be deleted from the real spec/tests, not preserved.

Training outputs are not trustworthy if they use only `Task Overhead` or `P * 16`. Hugging Face’s training memory breakdown includes model weights, optimizer states, gradients, saved forward activations, temporary buffers, and feature-specific memory. ([Hugging Face][2]) QLoRA should be frozen 4-bit base model plus trainable LoRA adapters, not a flat 4 GB add-on. ([arXiv][3])

1. **Fields to remove entirely from the main UI**

Remove these from the visible form:

```text
Architecture dropdown
Dense / Dense (Typical inference)
Active parameters, unless MoE is checked
KV cache precision
Training checkbox
LoRA checkbox
```

Replace training + LoRA checkboxes with one dropdown:

```text
Execution Mode:
- Inference
- LoRA fine-tuning
- QLoRA fine-tuning
- Full training
```

Move KV precision to Advanced. Normal users do not know what it means. Show only:

```text
Advanced assumptions > KV cache precision:
- 16-bit standard
- 8-bit / FP8
```

vLLM documents FP8 KV cache as a memory-reduction feature, not something every normal user should choose from the main form. ([vLLM][4])

Remove the hardware table from the main surface. Keep:

```text
Recommended Hardware Tier: 24 GB GPU Tier
Why: 20.1 GB required / 90% usable target = 22.3 GB raw VRAM needed
```

Then collapse the table.

Remove host RAM from the headline unless runtime is Local/Edge/offload. “32 GB host RAM” appears unexplained in the screenshot.

4. **Fields/elements missing**

Add:

```text
Model Family
```

Default:

```text
LLM / text generation
```

Options:

```text
LLM / text generation
Text encoder / embeddings
Encoder-decoder
Vision
Vision-language / multimodal
Image generation / diffusion
Video generation
Speech / audio
Tabular / classical ML
Custom
```

You need this because not every model has KV cache.

Add:

```text
Workload Size
```

For inference:

```text
Concurrent Requests
```

For training:

```text
Micro Batch Size
```

Do not call it just “Batch Size.”

Add:

```text
Accuracy
```

Values:

```text
Estimated
Advanced override
File-size based
Component-based
Rough
```

Engineers will trust the app more if it admits when it is estimating.

Add advanced fields:

```text
Known resident model size, GB
Num layers
Hidden size
Attention heads
KV heads
Head dim
Tensor parallel size
Memory sharding enabled
```

These should be hidden by default.

Add outputs:

```text
Minimum raw VRAM needed
Estimated speed
Formula used
```

5. **Would an engineer trust this?**

Not yet.

An engineer would like the visual direction, but they would not trust the math once they see:

```text
KV cache heuristic: parameters / 10
```

That is the biggest trust killer.

They would also question:

```text
Primary: RTX 4090
```

because the app does not show the actual fit math. It should show:

```text
Required: 20.1 GB
24 GB GPU usable target at 90%: 21.6 GB
Result: fits, tight
```

They would question `2x T4 16GB tensor parallel` unless you explicitly say:

```text
Only valid if runtime supports memory sharding / tensor parallelism.
```

They would question QLoRA and full training if those are modeled as flat/simple task overhead.

They would also notice spec contradictions: the current pasted plan says the app should be frontend-only and not preserve `/api/report`, while older plan text still preserves backend-era behavior and old expected examples. Clean this before giving it to agents.

6. **UX/UI polish needed**

Make the screen hierarchy this:

```text
Top:
  App title + compact status bar

Left/main:
  Result card
  Breakdown cards
  Recommendation

Right:
  Inputs

Bottom/collapsed:
  Advanced assumptions
  Hardware tiers
  Precision comparison
```

Use these exact main labels:

```text
Model Family
Execution Mode
Total Model Parameters
Unit
Precision
Runtime
Context Window
Concurrent Requests
MoE Model
```

For default LLM inference, visible fields should be:

```text
Model Family: LLM / text generation
Execution Mode: Inference
Total Model Parameters: 7
Unit: B
Precision: 16-bit
Runtime: Local / Edge
Context Window: 8000
Concurrent Requests: 1
MoE Model: unchecked
```

Hide Active Parameters until MoE is checked.

Change headline copy from:

```text
INFERENCE
16.0 GB weights, 0.8 GB KV, 32 GB host RAM
Primary: RTX 4090
```

to:

```text
Inference estimate
20.1 GB required

Recommended: 24 GB GPU tier
Fits because 24 GB × 90% usable = 21.6 GB
```

Change breakdown card labels:

```text
Weights
KV cache
Training state
Runtime overhead
Safety buffer
```

Do not use:

```text
Task
CUDA/system
```

Those labels are too vague.

Move “Calculation used” and “Assumptions” into a collapsed disclosure. Keep one short inline formula:

```text
Required = (weights + working memory + training state + runtime overhead) × buffer
```

The app should not show formula prose as a paragraph in the main viewport.

Use a softer card system:

```text
Background: near-black
Cards: slightly lighter black/green tint
Borders: 1px low-opacity green
Accent: one green
Text: off-white
Secondary text: muted gray-green
```

Reduce border glow. The current glow/grid style makes the app feel like a demo site instead of a professional calculator.

Use consistent spacing:

```text
Outer page padding: 24–32px
Panel padding: 24px
Input vertical gap: 14–16px
Section gap: 24px
Card gap: 12–16px
Border radius: 14–18px
```

Add a “confidence” badge near the result:

```text
Estimated
```

Edit bottom disclaimer:

```text
Estimates use heuristics. Real usage varies by model architecture, runtime, kernels, quantization, sharding, and offload settings.
```

Bottom line: visually, this still reads as an internal prototype. The fastest path to “credible” is not more styling. It is removing visible complexity, showing fit math, correcting the KV/training formulas, and making the hierarchy calmer.
